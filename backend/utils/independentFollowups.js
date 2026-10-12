const { createHash, randomUUID } = require('node:crypto');
const { hasActiveProfessionalAccess } = require('./firebaseAuth');
const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };
const name = d => d.displayName || [d.firstName || d.prenom, d.lastName || d.nom].filter(Boolean).join(' ') || '';
const idFor = (coach, client) => createHash('sha256').update(JSON.stringify([coach, client])).digest('hex');
const owns = (d, uid, id) => d && (id === uid || [d.uid,d.accountUid,d.authUid,d.linkedUserId,d.userId].includes(uid));
function createIndependentFollowups(db, lookupAccount, sendNotification) {
  async function personalCoach(uid, get) {
    const u = (await get(db.collection('users').doc(uid))).data();
    if (!u || u.role !== 'coach' || u.clubId || u.disabledByClub || !hasActiveProfessionalAccess(u)) fail('Un abonnement professionnel indépendant actif est nécessaire.');
    return u;
  }
  const service = {
    async create(coachUid, email) {
      if (typeof email !== 'string' || !email.includes('@')) fail('Adresse e-mail invalide.', 400);
      await personalCoach(coachUid, r => r.get());
      const account = await lookupAccount(email.trim().toLowerCase());
      if (!account || account.disabled || account.uid === coachUid) fail('Compte client indisponible.', 404);
      const clientId = 'independent-' + idFor(coachUid, account.uid);
      const ref = db.collection('clients').doc(clientId);
      const attempt = randomUUID();
      const result = await db.runTransaction(async tx => {
        const coach = await personalCoach(coachUid, r => tx.get(r));
        const [userSnap, previous, created, assigned] = await Promise.all([
          tx.get(db.collection('users').doc(account.uid)), tx.get(ref),
          tx.get(db.collection('clients').where('createdBy', '==', coachUid)),
          tx.get(db.collection('clients').where('coachIds', 'array-contains', coachUid)),
        ]);
        const user = userSnap.data();
        if (user?.role !== 'particulier') fail('Compte client indisponible.', 404);
        const old = previous.data();
        if (previous.exists && (old.coachUid !== coachUid || !owns(old, account.uid, clientId) || old.clubId)) fail('Accès refusé.');
        const used = new Set([...created.docs, ...assigned.docs].map(s => s.id)).size;
        const limit = coach.clientLimit ?? coach.proAccess?.clientLimit;
        if (!previous.exists && typeof limit === 'number' && used >= limit) fail('La capacité du professionnel est atteinte.', 409);
        const notify = !old || (old.followupEmailStatus !== 'sent' && !(old.followupEmailStatus === 'pending' && Date.now() - old.followupEmailAttemptedAt < 30 * 60000));
        const delivery = notify ? { followupEmailStatus: 'pending', followupEmailAttempt: attempt, followupEmailAttemptedAt: Date.now() } : {};
        // Reuse account identity only. Never copy another professional's dossier or change the club referent.
        if (!previous.exists) tx.set(ref, {
          uid: account.uid, accountUid: account.uid, linkedUserId: account.uid,
          prenom: user.firstName || user.prenom || '', nom: user.lastName || user.nom || '',
          firstName: user.firstName || user.prenom || '', lastName: user.lastName || user.nom || '',
          email: account.email || email.trim().toLowerCase(), emailLower: (account.email || email).trim().toLowerCase(),
          createdBy: coachUid, coachId: coachUid, coachUid, coachIds: [coachUid],
          clubId: null, clubIds: [], followupType: 'independent',
          initiatedBy: coachUid, createdAt: Date.now(), updatedAt: Date.now(), ...delivery,
        });
        else if (notify) tx.update(ref, delivery);
        return { notify, coachName: name(coach), clientName: name(user), language: user.preferredLang || user.langue || user.language || 'fr' };
      });
      if (!result.notify) return { ok: true, clientId, emailDelivery: 'already-requested' };
      const finish = status => db.runTransaction(async tx => {
        const latest = (await tx.get(ref)).data();
        if (latest?.followupEmailAttempt === attempt) tx.update(ref, { followupEmailStatus: status, followupEmailFinishedAt: Date.now() });
      });
      try {
        await sendNotification({ to: account.email || email.trim().toLowerCase(), uid: account.uid, clientId, coachUid, ...result });
        await finish('sent');
        return { ok: true, clientId, emailSent: true };
      } catch {
        await finish('failed');
        return { ok: true, clientId, emailSent: false, emailWarning: 'followup-email-failed' };
      }
    },
    async list(uid) {
      const [user, direct, ...records] = await Promise.all([
        db.collection('users').doc(uid).get(), db.collection('clients').doc(uid).get(),
        ...['uid','accountUid','authUid','linkedUserId','userId'].map(k=>db.collection('clients').where(k,'==',uid).get()),
      ]);
      if(user.data()?.role!=='particulier')fail('Accès refusé.');
      const dossiers=[...new Map([direct,...records.flatMap(s=>s.docs)].filter(s=>s.exists).map(s=>[s.id,s])).values()].filter(s=>owns(s.data(),uid,s.id)&&!s.data().deletedFromClub);
      const followups=await Promise.all(dossiers.map(async s=>{
        const d=s.data(),coachUid=d.clubReferents?.[d.clubId]??d.coachUid??d.coachId??d.createdBy;
        const coach=coachUid?(await db.collection('users').doc(coachUid).get()).data():null;
        return {id:s.id,clubName:d.clubName||'',coachName:coach?.accountType==='club_owner'?'':name(coach||{}),personal:coachUid===uid || !coachUid,independent:!d.clubId,hidden:(user.data().hiddenFollowupIds||[]).includes(s.id)};
      }));
      return {activeId:user.data().linkedClientId||'',followups};
    },
    async visibility(uid,clientId,hidden) {
      if(typeof clientId!=='string'||clientId.includes('/')||typeof hidden!=='boolean')fail('Réglage invalide.',400);
      await db.runTransaction(async tx=>{
        const [u,c]=await Promise.all([tx.get(db.collection('users').doc(uid)),tx.get(db.collection('clients').doc(clientId))]);
        if(u.data()?.role!=='particulier'||!owns(c.data(),uid,c.id))fail('Accès refusé.');
        const ids=new Set(u.data().hiddenFollowupIds||[]);if(hidden)ids.add(clientId);else ids.delete(clientId);
        tx.update(u.ref,{hiddenFollowupIds:[...ids]});
      });return {ok:true};
    },
    async select(uid,clientId) {
      if(typeof clientId!=='string'||!/^[^/]{1,180}$/.test(clientId))fail('Client invalide.',400);
      await db.runTransaction(async tx=>{
        const [u,c]=await Promise.all([tx.get(db.collection('users').doc(uid)),tx.get(db.collection('clients').doc(clientId))]);
        if(u.data()?.role!=='particulier'||!owns(c.data(),uid,c.id)||c.data().deletedFromClub)fail('Accès refusé.');
        tx.update(u.ref,{linkedClientId:clientId});
      });return {ok:true};
    },
  };return service;
}
module.exports={createIndependentFollowups,idFor};
