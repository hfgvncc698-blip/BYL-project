const express = require("express");
const admin = require("../firebaseAdmin");
const { canUseIntegratedMessaging } = require("../utils/messagingPlanAccess");
const { watchInbox, replyInbox, renewInbox } = require('../utils/clubInboxWatch');
const { requireUnrevokedFirebaseAuth: requireFirebaseAuth } = require("../utils/firebaseAuth");

const router = express.Router();
router.use("/club", require("./clubMessaging"));
const db = admin.firestore();

const clean = (value, maxLength = 180) => String(value || "").trim().slice(0, maxLength);
const disabled = profile => profile?.disabled || profile?.disabledByClub || profile?.deletedFromClub ||
  ['club_disabled','club_deleted'].includes(profile?.subscriptionStatus) || ['deleted','removed','disabled','inactive','club_deleted'].includes(profile?.status);
const list = (value) => (Array.isArray(value) ? value.map(String) : []);

// A relink supersedes older aliases; the dossier ID is the final legacy fallback.
const clientAccountUids = (clientId, client = {}) => new Set([
  client.authUid || client.accountUid || client.linkedUserId || client.userId || client.uid || clientId,
]);

const clientProfessionalUids = (client = {}) => new Set([
  ...list(client.coachIds),
  ...list(client.professionalIds),
  ...list(client.nutritionCoachIds),
  client.createdBy,
  client.coachId,
  client.coachUid,
  client.ownerUid,
  client.assignedBy,
].filter(Boolean).map(String));

// Only records linked to the authenticated account; never match by email.
router.get("/client-records", requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.auth.uid;
    if(disabled((await db.collection('users').doc(uid).get()).data())) return res.status(403).json({error:'messaging-forbidden'});
    const direct = await db.collection("clients").doc(uid).get();
    const results = await Promise.all(["authUid", "accountUid", "linkedUserId", "userId", "uid"].map(field => db.collection("clients").where(field, "==", uid).get()));
    const records = new Map();
    for (const snap of [direct, ...results.flatMap(result => result.docs)]) {
      if (!snap.exists || !clientAccountUids(snap.id, snap.data()).has(uid)) continue;
      const data = snap.data();
      records.set(snap.id, { id: snap.id, authUid: uid, professionalIds: [...clientProfessionalUids(data)], coachName: data.coachName || "" });
    }
    res.json({ records: [...records.values()] });
  } catch (_error) { res.status(500).json({ error: "messaging-contacts-unavailable" }); }
});

router.get("/access", requireFirebaseAuth, async (req, res) => {
  try {
    const clientId = clean(req.query.clientId);
    const professionalUid = clean(req.query.professionalUid);
    if (!clientId || !professionalUid) return res.status(400).json({ error: "invalid-conversation" });
    const clientSnap = await db.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) return res.status(404).json({ error: "client-not-found" });
    const client = clientSnap.data();
    if (!clientProfessionalUids(client).has(professionalUid) ||
        (req.auth.uid !== professionalUid && !clientAccountUids(clientId, client).has(req.auth.uid))) {
      return res.status(403).json({ error: "conversation-not-allowed" });
    }
    const professional = await db.collection("users").doc(professionalUid).get();
    const actor=req.auth.uid===professionalUid?professional.data():(await db.collection('users').doc(req.auth.uid).get()).data();
    if(disabled(actor)) return res.status(403).json({error:'conversation-not-allowed'});
    if(req.auth.uid===professionalUid && !coachAccess(professional.data(),req.auth.token)) return res.status(403).json({error:'conversation-not-allowed'});
    res.json({ included: professional.exists && canUseIntegratedMessaging(professional.data()) });
  } catch (_error) { res.status(500).json({ error: "messaging-access-unavailable" }); }
});

// The Admin SDK bypasses rules. Match hasCoachAccess for the authenticated reader.
function coachAccess(profile, token = {}) {
  if (profile?.role === 'admin') return token.email_verified === true;
  if (profile?.role !== 'coach' || (profile.emailVerificationRequired && token.email_verified !== true)) return false;
  return profile.hasActiveSubscription === true || ['active','club_active'].includes(profile.subscriptionStatus) ||
    (profile.subscriptionStatus === 'trialing' && profile.trialEndsAt?.toMillis?.() > Date.now());
}
// Apply current dossier and participant checks before exposing any summary.
function visibleTo(row, client, uid, profile, token, preview) {
  if(disabled(profile)) return false;
  if (!client || !Array.isArray(row.participantUids) || !row.participantUids.includes(row.clientUid) || !row.participantUids?.includes(row.professionalUid)) return false;
  if (!clientProfessionalUids(client).has(row.professionalUid) || !clientAccountUids(row.clientId,client).has(row.clientUid)) return false;
  if (preview) return profile?.role === 'admin' && token.email_verified === true;
  if (!row.participantUids.includes(uid)) return false;
  if (profile?.role === 'admin' && token.email_verified === true) return true;
  if (row.clientUid === uid) return true;
  return row.professionalUid === uid && coachAccess(profile,token) &&
    ([client.createdBy,client.coachId,client.coachUid,client.ownerUid,client.assignedBy,...list(client.coachIds),...list(client.sharedWith)].includes(uid)
      || (profile.clubId && profile.clubId===client.clubId));
}
router.get('/inbox', requireFirebaseAuth, async (req,res) => {
  const controller = new AbortController();
  const admittedAt=req.auth.admittedAt;
  res.once('close',()=>controller.abort());
  try {
    const uid=req.auth.uid, target=req.query.coach || uid, preview=uid!==target;
    if(typeof target!=='string' || target.length>180 || target.includes('/')) return res.sendStatus(400);
    const profileRef=db.collection('users').doc(uid);
    if (preview && (req.auth.token.email_verified!==true || (await profileRef.get()).data()?.role!=='admin')) return res.sendStatus(403);
    const focused=req.query.focusConversation;
    const paths=[];
    if(focused!==undefined){
      if(typeof focused!=='string' || !focused || focused.includes('/') || focused.length>400) return res.sendStatus(400);
      const row=(await db.collection('conversations').doc(focused).get()).data();
      if(row && Array.isArray(row.participantUids) && row.participantUids.includes(target)){
        row.professionalUid ||= row.coachUid;
        if(typeof row.clientId==='string' && !row.clientId.includes('/') && focused===row.clientId+'__'+row.professionalUid){
          const [dossier,actor]=await Promise.all([db.collection('clients').doc(row.clientId).get(),profileRef.get()]);
          if(visibleTo(row,dossier.data(),uid,actor.data(),req.auth.token,preview) && (!preview || row.professionalUid===target))
            paths.push('users/'+uid,'clients/'+row.clientId,'messagingRevocations/'+uid);
        }
      }
    }
    const snapshot=await watchInbox(db,'participantUids',target,req.query.since,controller.signal,'conversations','array-contains',paths,{subject:['professional',uid,req.auth.token.auth_time,target,focused],known:req.query.known});
    if(controller.signal.aborted) return;
    if(req.query.since){await requireFirebaseAuth(req,res,()=>true);if(res.headersSent) return;}
    const actorSnapshot=await profileRef.get();
    snapshot.trace?.document(actorSnapshot);
    const profile=actorSnapshot.data();
    if (preview && (profile?.role!=='admin' || !req.auth.token.email_verified)) return res.sendStatus(403);
    const receiptScope=[uid,target,req.auth.token.auth_time,req.auth.token.email_verified,preview,focused || '',
      profile || null,coachAccess(profile,req.auth.token)];
    if(renewInbox(res,req.query.known,snapshot,receiptScope)) return;
    await snapshot.verifyRoots(admittedAt);
    const dossiers=new Map(), professionals=new Map(), contacts=[], hiddenAtByConversation={};
    const ids=[...new Set(snapshot.docs.map(d=>d.data().clientId).filter(id=>typeof id==='string' && id && !id.includes('/')))];
    if(ids.length>=8) for(let i=0;i<ids.length;i+=100){
      const docs=await db.getAll(...ids.slice(i,i+100).map(id=>db.collection('clients').doc(id)));
      for(const doc of docs){snapshot.trace?.document(doc);dossiers.set(doc.id,doc.data());}
    }
    for(const doc of snapshot.docs){
      const row=doc.data();
      row.professionalUid ||= row.coachUid;
      if(doc.id!==row.clientId+'__'+row.professionalUid) continue;
      if(typeof row.clientId!=='string'||!row.clientId||row.clientId.includes('/') || (preview && row.professionalUid!==target)) continue;
      if(!dossiers.has(row.clientId)){
        const doc=await db.collection('clients').doc(row.clientId).get();
        snapshot.trace?.document(doc);dossiers.set(row.clientId,doc.data());
      }
      const client=dossiers.get(row.clientId);
      if(!visibleTo(row,client,uid,profile,req.auth.token,preview)) continue;
      const stamps=Object.entries(row.lastByUid || {}).filter(([sender])=>sender!==uid).map(([,time])=>time);
      if(row.lastSenderUid && row.lastSenderUid!==uid) stamps.push(row.lastMessageAt);
      const incoming=stamps.filter(Boolean).sort((a,b)=>b.seconds-a.seconds || b.nanoseconds-a.nanoseconds)[0];
      const read=row.readAtBy?.[uid];
      const hidden=row.hiddenAtBy?.[uid]?.toMillis?.()||0, activity=row.lastMessageAt?.toMillis?.()||0;
      if(hidden && hidden>=activity) { hiddenAtByConversation[doc.id]=hidden; continue; }
      const clientName=row.clientName || [client.prenom||client.firstName,client.nom||client.lastName].filter(Boolean).join(' ') || client.name || client.email || row.clientId;
      let professionalName=row.professionalName || client.coachName || '';
      if(!professionalName && row.clientUid===uid){
        if(!professionals.has(row.professionalUid)){
          const doc=await db.collection('users').doc(row.professionalUid).get();
          snapshot.trace?.document(doc);
          const data=doc.data() || {};
          professionals.set(row.professionalUid,data.displayName || [data.firstName,data.lastName].filter(Boolean).join(' '));
        }
        professionalName=professionals.get(row.professionalUid);
      }
      const title=row.clientUid===uid ? professionalName : clientName;
      contacts.push({id:doc.id,clientId:row.clientId,clientUid:row.clientUid,coachUid:row.professionalUid,clientName,professionalName,title,
        email:row.clientUid===uid?'':client.email||'',lastMessage:row.lastMessage||'',lastMessageAtIso:row.lastMessageAtIso || '',lastMessageMeta:row.lastMessageMeta||null,
        lastActivityAt:activity,receivedVersion:incoming && [incoming.seconds,incoming.nanoseconds].join(':'),hiddenAtMillis:hidden, unread:!!incoming && (!read || incoming.seconds>read.seconds || (incoming.seconds===read.seconds && incoming.nanoseconds>read.nanoseconds)),
        conversation:{id:doc.id,readStamps:Object.fromEntries(Object.entries(row.readAtBy||{}).map(([key,t])=>[key,[t.seconds,t.nanoseconds].join(':')])),readAtBy:Object.fromEntries(Object.entries(row.readAtBy||{}).map(([key,t])=>[key,t.toMillis?.()||0]))}});
    }
    const deniedThread=focused && !contacts.some(c=>c.id===focused) ? JSON.stringify(['','professional',focused]) : '';
    if(!controller.signal.aborted) replyInbox(res,req.query.known,snapshot.version,{contacts,hiddenAtByConversation,deniedThread},{snapshot,scope:receiptScope});
  } catch(error) { if(!controller.signal.aborted) res.status(503).json({error:'messaging-inbox-unavailable'}); }
});

router.post('/read', requireFirebaseAuth, async(req,res)=>{
  try {
    const {conversationId,messageId}=req.body;
    if (![conversationId,messageId].every(id=>typeof id==='string' && id && !id.includes('/') && id.length<=400)) return res.sendStatus(400);
    const uid=req.auth.uid, ref=db.collection('conversations').doc(conversationId);
    await db.runTransaction(async tx=>{
      await req.auth.assertMessagingSession(tx);
      const row=(await tx.get(ref)).data();
      if(row) row.professionalUid ||= row.coachUid;
      if(!row?.participantUids?.includes(uid) || conversationId!==row.clientId+'__'+row.professionalUid) throw Object.assign(new Error(),{status:403});
      const [dossier,user,message]=await Promise.all([tx.get(db.collection('clients').doc(row.clientId)),tx.get(db.collection('users').doc(uid)),tx.get(ref.collection('messages').doc(messageId))]);
      if(!visibleTo(row,dossier.data(),uid,user.data(),req.auth.token,false)) throw Object.assign(new Error(),{status:403});
      if(!message.exists || message.data().senderUid===uid) throw Object.assign(new Error(),{status:400});
      const next=message.data().createdAt || message.createTime, old=row.readAtBy?.[uid];
      if(req.body.watermark!==[next.seconds,next.nanoseconds].join(':')) throw Object.assign(new Error(),{status:409});
      if(!old || old.seconds<next.seconds || (old.seconds===next.seconds && old.nanoseconds<next.nanoseconds))
        tx.set(ref,{readAtBy:{[uid]:next}},{merge:true});
    });
    res.json({ok:true});
  } catch(error) {res.status(error.status||500).json({error:'read-unavailable'});}
});
router.post("/send", requireFirebaseAuth, async (req, res) => {
  try {
    const senderUid = req.auth.uid;
    const text = clean(req.body?.text, 4000);
    const clientId = clean(req.body?.clientId);
    const clientUid = clean(req.body?.clientUid);
    const professionalUid = clean(req.body?.professionalUid || req.body?.coachUid);

    if (!text) return res.status(400).json({ error: "message-required" });
    if (!clientId || !clientUid || !professionalUid || clientUid === professionalUid) {
      return res.status(400).json({ error: "invalid-conversation" });
    }

    const conversationId = `${clientId}__${professionalUid}`;
    if ([clientId,clientUid,professionalUid].some(id=>id.includes('/'))) return res.sendStatus(400);
    const ref=db.collection('conversations').doc(conversationId);
    const requestId=req.body.requestId;
    if(requestId && !/^[\da-f-]{36}$/i.test(requestId)) return res.sendStatus(400);
    const messageRef=requestId ? ref.collection('messages').doc(require('node:crypto').createHash('sha256').update(senderUid+':'+requestId).digest('hex')) : ref.collection('messages').doc();
    const nowIso=new Date().toISOString();
    const confirmed=await db.runTransaction(async tx=>{
      await req.auth.assertMessagingSession(tx);
      const [client,user,professional,parent,existing]=await Promise.all([
        tx.get(db.collection('clients').doc(clientId)),tx.get(db.collection('users').doc(senderUid)),
        tx.get(db.collection('users').doc(professionalUid)),tx.get(ref),tx.get(messageRef)]);
      const allowedAdmin=['admin','super_admin','superadmin'].includes(user.data()?.role) && req.auth.token?.email_verified===true;
      if(disabled(user.data())) throw Object.assign(new Error('conversation-not-allowed'),{status:403});
      if (!client.exists || !clientAccountUids(clientId,client.data()).has(clientUid) || !clientProfessionalUids(client.data()).has(professionalUid)
        || (!allowedAdmin && senderUid!==professionalUid && senderUid!==clientUid)
        || (senderUid===professionalUid && !allowedAdmin && !coachAccess(user.data(),req.auth.token))
        || (parent.exists && (parent.data().clientUid!==clientUid || (parent.data().professionalUid || parent.data().coachUid)!==professionalUid || !Array.isArray(parent.data().participantUids) || !parent.data().participantUids.includes(clientUid) || !parent.data().participantUids.includes(professionalUid))))
        throw Object.assign(new Error('conversation-not-allowed'),{status:403});
      if(!professional.exists || !canUseIntegratedMessaging(professional.data())) throw Object.assign(new Error('messaging-not-included'),{status:403});
      if(existing.exists) {
        if(existing.data().text!==text) throw Object.assign(new Error('request-id-conflict'),{status:409});
        return existing.data();
      }
      const timestamp=admin.firestore.FieldValue.serverTimestamp();
      const prior=parent.data() || {};
      const clientName=clean(req.body?.clientName), professionalName=clean(req.body?.professionalName);
      tx.set(ref,{clientId, clientUid, professionalUid, coachUid:professionalUid, participantUids:[clientUid,professionalUid],
        ...(clientName?{clientName}:{}), ...(professionalName?{professionalName}:{}), lastMessage:text.slice(0,180), lastMessageAt:timestamp,
        lastMessageAtIso:nowIso,lastSenderUid:senderUid,updatedAt:timestamp,lastByUid:{
          ...(prior.lastSenderUid && prior.lastMessageAt ? {[prior.lastSenderUid]:prior.lastMessageAt}:{}),[senderUid]:timestamp}},{merge:true});
      const value={text,senderUid,createdAtIso:nowIso,type:'text'};
      tx.set(messageRef,{...value,createdAt:timestamp});
      return value;
    });
    return res.status(201).json({
      ok: true,
      conversationId,
      message: {
        id: messageRef.id,
        text:confirmed.text,
        senderUid:confirmed.senderUid,
        createdAtIso:confirmed.createdAtIso,
        type: "text",
      },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({error:error.message});
    console.error("[messaging] send failed:", error?.code);
    return res.status(500).json({ error: "message-send-failed" });
  }
});

// Prepare the two signup rollback paths. No target UID is accepted from the caller.
router.post('/registration-rollback', requireFirebaseAuth, async(req,res)=>{
  try{
    const uid=req.auth.uid, account=await admin.auth().getUser(uid);
    const created=Date.parse(account.metadata.creationTime);
    if(!Number.isFinite(created) || Date.now()-created>15*60000) return res.sendStatus(403);
    const {block}=require('../utils/messagingRevocation');
    const result=await db.runTransaction(async tx=>{
      await req.auth.assertMessagingSession(tx);
      if((await tx.get(db.collection('users').doc(uid))).exists) return false;
      block(tx,db,uid,true);
      return true;
    });
    res.sendStatus(result ? 204 : 409);
  }catch(error){res.sendStatus(error.status===401 ? 401 : 503);}
});

module.exports = router;
