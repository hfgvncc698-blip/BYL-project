const express = require("express");
const { gzip } = require("node:zlib");
const { promisify } = require("node:util");
const admin = require("../firebaseAdmin");
const { requireFirebaseAuth, requireUnrevokedFirebaseAuth, hasActiveProfessionalAccess } = require("../utils/firebaseAuth");
const programListSummary = require("../utils/programListSummary");
const compress = promisify(gzip);
const router = express.Router();

const versionOf = snapshot => `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}`;

// Compare Firestore's server updateTime, not optional application timestamps.
// Unchanged documents stay complete on the client; every changed document is
// returned in full. The projection also detects additions and deletions.
router.post("/dashboard-templates", requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.auth.uid;
    const requesterSnap = await admin.firestore().collection("users").doc(uid).get();
    const requester = requesterSnap.exists ? requesterSnap.data() : {};
    if (!hasActiveProfessionalAccess(requester, req.auth.token)) {
      return res.status(403).json({ error: "professional-access-required" });
    }
    const coachId = String(req.body?.coachId || uid).trim();
    const verifiedAdmin = requester.role === "admin" && req.auth.token.email_verified === true;
    if (!coachId || coachId.includes("/") || (coachId !== uid && !verifiedAdmin)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const db = admin.firestore();
    const summaries = req.body?.summaries === true;
    // Firestore projects metadata on the server: no exercise bodies cross the
    // database connection for current templates with a stored session count.
    const snapshot = await db.collection("programmes").where("createdBy", "==", coachId).limit(200)
      .select(...(summaries ? programListSummary.fields : [])).get();
    const readVersion = document => summaries ? `summary:${versionOf(document)}` : versionOf(document);
    const knownVersions = req.body?.knownVersions || {};
    const changed = snapshot.docs.filter(document => knownVersions[document.id] !== readVersion(document));
    const needsFullDocument = changed.filter(document =>
      !summaries || programListSummary.sessionCount(document.data()) == null);
    const fullDocuments = needsFullDocument.length
      ? await db.getAll(...needsFullDocument.map(document => document.ref)) : [];
    const fullById = new Map(fullDocuments.map(document => [document.id, document]));
    const documents = changed.map(document => {
      if (!summaries || programListSummary.sessionCount(document.data()) == null) return fullById.get(document.id);
      const data = document.data();
      return {
        id: document.id, exists: true, updateTime: document.updateTime,
        data: () => ({ ...data, sessions: Array.from({length: programListSummary.sessionCount(data)}, () => ({})) }),
      };
    }).filter(Boolean);
    // Recheck ownership after the projection in case a document was transferred.
    const programs = documents.filter(document => document.exists && document.data().createdBy === coachId)
      .map(document => ({ ...(summaries ? programListSummary(document.data()) : document.data()), id: document.id, __dashboardReadVersion: readVersion(document) }));
    const unchanged = snapshot.docs.filter(document => knownVersions[document.id] === readVersion(document)).map(document => document.id);
    const serialized = JSON.stringify({ programs, unchanged }, function (key, value) {
      const original = this[key];
      // Match web SDK Timestamp.toJSON(), including nested exercise dates.
      return original && typeof original.toDate === "function" && typeof original.seconds === "number"
        ? { seconds: original.seconds, nanoseconds: original.nanoseconds || 0 }
        : value;
    });
    res.set("Cache-Control", "private, no-store");
    res.vary("Accept-Encoding");
    res.type("application/json");
    if (req.acceptsEncodings("gzip")) {
      const body = await compress(serialized);
      res.set("Content-Encoding", "gzip");
      return res.send(body);
    }
    return res.send(serialized);
  } catch (error) {
    console.error("[coach-program-read] failed", error?.message);
    return res.status(500).json({ error: "program-read-failed" });
  }
});

// Each request is one visible page (or one bounded filter batch). The three
// ownership forms match the directory query, even for an administrator preview.
router.post(['/client-list-summary','/dashboard-client-programs'], requireUnrevokedFirebaseAuth, async (req,res)=>{
  const detailed=req.path==='/dashboard-client-programs';
  const {coachId,ids,since}=req.body || {};
  // Admission and ownership are checked transactionally for every requested root.
  // Detailed responses remain capped at 4 MiB below; no persistent projection.
  const validId=id=>typeof id==='string' && id.length>0 && id.length<=256 && !id.includes('/');
  if(!validId(coachId) || !Array.isArray(ids) || !ids.length || ids.length>(detailed?32:25) || !ids.every(validId) || (!detailed && (!Number.isFinite(since) || Math.abs(since-(Date.now()-7*86400000))>86400000)))return res.sendStatus(400);
  const db=admin.firestore();
  try {
    const summaries=await db.runTransaction(async tx=>{
      await req.auth.assertMessagingSession(tx);
      const actor=(await tx.get(db.collection('users').doc(req.auth.uid))).data();
      if(!actor || actor.disabled || actor.disabledByClub || actor.deletedFromClub || ['inactive','disabled','deleted','removed','club_deleted'].includes(actor.status))
        throw Object.assign(Error('forbidden'),{status:403});
      const adminView=actor?.role==='admin' && req.auth.token.email_verified===true;
      if(!adminView && (req.auth.uid!==coachId || actor?.role!=='coach' ||
        (actor.emailVerificationRequired===true && req.auth.token.email_verified!==true) ||
        !(actor.hasActiveSubscription===true || ['active','club_active'].includes(actor.subscriptionStatus) ||
          (actor.subscriptionStatus==='trialing' && actor.trialEndsAt?.toMillis?.()>Date.now()))))throw Object.assign(Error('forbidden'),{status:403});
      const refs=[...new Set(ids)].map(id=>db.collection('clients').doc(id));
      const docs=await tx.getAll(...refs);
      if(!docs.every(doc=>doc.exists && (doc.get('createdBy')===coachId || doc.get('coachId')===coachId ||
        (Array.isArray(doc.get('coachIds')) && doc.get('coachIds').includes(coachId)))))throw Object.assign(Error('forbidden'),{status:403});
      if(detailed){
        const {readDashboardBundles}=require('../utils/coachDashboardBundles');
        return readDashboardBundles(tx,refs);
      }
      const modules=[actor?.modules,actor?.proAccess?.modules].filter(Array.isArray).flat();
      const nutrition=adminView || actor.subscriptionStatus==='trialing' || modules.some(m=>m==='nutrition'||m==='club') ||
        [actor.packageKey,actor.proAccess?.packageKey].some(k=>['nutrition','complete','club'].includes(k)) ||
        actor.nutritionAccess===true || actor.hasNutritionAccess===true || actor.features?.nutrition===true;
      const {readListSummaries}=require('../utils/coachClientListSummary');
      return readListSummaries(db,tx,docs,since,{sport:req.body.sport!==false,nutrition},req.body.refreshId);

    });
    const body=JSON.stringify(detailed ? {clients:summaries} : {summaries});
    if(detailed && Buffer.byteLength(body)>4*1024*1024)return res.sendStatus(413);
    res.set('Cache-Control','private, no-store').vary('Accept-Encoding').type('application/json');
    if(req.acceptsEncodings('gzip'))return res.set('Content-Encoding','gzip').send(await compress(body));
    return res.send(body);
  } catch(error){res.status([401,403].includes(error.status)?error.status:503).json({error:'client-list-summary-unavailable'});}
});

module.exports = router;
