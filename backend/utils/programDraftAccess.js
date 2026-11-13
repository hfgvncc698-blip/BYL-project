const crypto = require('node:crypto');
const admin = require('../firebaseAdmin');
const {hasActiveProfessionalAccess} = require('./firebaseAuth');
const fail = (status, message) => { throw Object.assign(new Error(message),{status}); };
const active = data => data && !data.disabled && !data.disabledByClub && !data.deletedFromClub && !['disabled','deleted','removed','inactive','club_deleted'].includes(data.status);
const version = snap => snap?.exists ? `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}` : null;
const own = (data,uid) => ['createdBy','coachId','coachUid','ownerUid','assignedBy'].some(k=>data?.[k]===uid) || ['coachIds','sharedWith'].some(k=>Array.isArray(data?.[k])&&data[k].includes(uid));

async function authorizedDraft(req, tx, target = {}) {
    const uid=req.auth.uid;
    for(const value of [target.programId,target.clientId,target.coachId])if(value!=null && (typeof value!=='string'||value.includes('/')||value.length>128))fail(400,'invalid-draft-target');
    const coachId=target.coachId||uid;
    const programId=target.programId||null, clientId=target.clientId||null;
    if(clientId&&!programId)fail(400,'missing-program');
    const db=admin.firestore(), program=programId ? db.doc(clientId?`clients/${clientId}/programmes/${programId}`:`programmes/${programId}`):null;
    const hash=crypto.createHash('sha256').update(JSON.stringify([coachId,clientId,programId])).digest('hex');
    const ref=db.doc(`programDrafts/${uid}/entries/${hash}`);
      await req.auth.assertMessagingSession(tx);
      const user=(await tx.get(db.doc('users/'+uid))).data();
      const isAdmin=user?.role==='admin'&&req.auth.token.email_verified===true;
      if(!user||user.disabled||['disabled','deleted','removed','inactive'].includes(user.status)||!hasActiveProfessionalAccess(user,req.auth.token)||(!isAdmin&&coachId!==uid))fail(403,'draft-forbidden');
      const snap=program?await tx.get(program):null;
      if(program&&!snap.exists)fail(404,'program-not-found');
      const record=clientId?(await tx.get(db.doc('clients/'+clientId))).data():snap?.data();
      if(record&&!isAdmin&&!own(record,uid)){
        if(!active(user))fail(403,'draft-forbidden');
        const club=record.clubId;
        if(!club||club!==user.clubId)fail(403,'draft-forbidden');
        const [member,root]=await tx.getAll(db.doc(`clubs/${club}/members/${uid}`),db.doc(`clubs/${club}`));
        if(!(member.exists&&active(member.data())) && !(root.exists&&(root.data().ownerUid||club)===uid))fail(403,'draft-forbidden');
      }
      if(clientId&&!record)fail(403,'draft-forbidden');
      const scope=JSON.stringify([uid,user.role,user.clubId||null,user.linkedClientId||null,coachId]);

 return {ref,snap,scope,coachId,programId,clientId};
}
module.exports={authorizedDraft,version,fail};
