// Controlled integration. No endpoint creates provenance or approves data disposal.
const express = require('express');
const crypto = require('node:crypto');
const admin = require('../firebaseAdmin');
const {requireUnrevokedFirebaseAuth} = require('../utils/firebaseAuth');
const {authorizedDraft, version, fail} = require('../utils/programDraftAccess');
const router = express.Router();
const PROTOCOL = 'byl-private-cache-v1';
const idValid = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const normalize = x => Array.isArray(x) ? x.map(normalize) : x && typeof x === 'object'
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, normalize(x[k])])) : x;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
const cleanupEnabled = () => process.env.BYL_CACHE_MIGRATION_CLEANUP === 'true' &&
  /^demo-/.test(process.env.GCLOUD_PROJECT || '') &&
  /^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') &&
  /^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '');
function checkProof(proof, req) {
  if (!proof || proof.ownerUid !== req.auth.uid || proof.protocol !== PROTOCOL || proof.revoked ||
      !Number.isFinite(proof.expiresAt) || proof.expiresAt <= Date.now()) fail(403, 'migration-provenance-required');
}
async function admitProof(req, tx, proof) {
  checkProof(proof, req);
  const context = await authorizedDraft(req, tx, proof.target);
  if (context.scope !== proof.scope) fail(403, 'migration-scope-changed');
  return context;
}
router.use(requireUnrevokedFirebaseAuth);
router.post('/:action', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    if (req.body?.protocol !== PROTOCOL) fail(409, 'migration-version-mismatch');
    const {action} = req.params, uid = req.auth.uid, db = admin.firestore();
    if (action === 'discover') {
      // Explicit user action, bounded listing; no recurring request on page mounts.
      const candidates = await db.collection(`cacheMigrationProvenance/${uid}/entries`).limit(21).get();
      const allowed = [];
      for (const row of candidates.docs.slice(0,20)) {
        try {
          await db.runTransaction(tx => admitProof(req, tx, row.data()));
          allowed.push({id: row.id}); // No local keys or document contents in a proposal.
        } catch (error) { if (!error.status) throw error; }
      }
      return res.json({candidates: allowed, truncated: candidates.size > 20, cleanupEnabled: cleanupEnabled()});
    }
    const id = req.body?.id;
    if (!idValid(id)) fail(400, 'invalid-migration-id');
    if (['authorize','import','receipt'].includes(action)) {
      const proofRef = db.doc(`cacheMigrationProvenance/${uid}/entries/${id}`);
      const receiptRef = db.doc(`cacheMigrationReceipts/${uid}/entries/${id}`);
      const result = await db.runTransaction(async tx => {
        const proof = (await tx.get(proofRef)).data();
        const context = await admitProof(req, tx, proof);
        const saved = await tx.get(context.ref), receipt = await tx.get(receiptRef);
        if (action === 'receipt') {
          if (!receipt.exists || !saved.exists || saved.data().migrationId !== id ||
              digest(saved.data().value) !== receipt.data().digest) fail(409, 'migration-receipt-conflict');
          return {revision: saved.data().revision, digest: receipt.data().digest};
        }
        if (proof.baseVersion !== version(context.snap)) fail(409, 'migration-program-conflict');
        if (action === 'authorize') return {source: proof.source, digest: proof.digest, revision: saved.data()?.revision || 0};
        if (req.body.confirm !== true) fail(400, 'migration-confirmation-required');
        const value = req.body.value;
        if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.programName!=='string' || !Array.isArray(value.sessions) ||
            Buffer.byteLength(JSON.stringify(value)) > 700000 || digest(value) !== proof.digest) fail(400, 'migration-content-mismatch');
        if (receipt.exists) {
          if (!saved.exists || saved.data().migrationId !== id || digest(saved.data().value) !== proof.digest) fail(409, 'migration-receipt-conflict');
          return {revision: saved.data().revision, digest: proof.digest, alreadyImported: true};
        }
        // Never replace a current draft, even with a browser-supplied revision.
        if (saved.exists) fail(409, 'migration-draft-conflict');
        tx.create(context.ref, {value, baseVersion: proof.baseVersion, scope: context.scope,
          target: proof.target, revision: 1, migrationId: id, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
        tx.create(receiptRef, {digest: proof.digest, revision: 1, createdAt: admin.firestore.FieldValue.serverTimestamp()});
        return {revision: 1, digest: proof.digest, alreadyImported: false, _writeCount:2};
      });
      const {_writeCount=0,...payload}=result;
      if(process.env.BYL_FIRESTORE_METRICS==='1')console.info('[byl-migration-writes]',JSON.stringify({action,documentWrites:_writeCount}));
      return res.json(payload);
    }
    if (['cleanup-plan','checkpoint'].includes(action)) {
      if (!cleanupEnabled()) fail(403, 'migration-cleanup-disabled');
      const result = await db.runTransaction(async tx => {
        const plan = (await tx.get(db.doc(`cacheMigrationPlans/${uid}/entries/${id}`))).data();
        await admitProof(req, tx, plan);
        if (plan.disposition !== 'qualified' || plan.origin !== req.body.origin) fail(403, 'migration-disposition-required');
        const operationRef=db.doc(`cacheMigrationOperations/${uid}/entries/${id}`);
        const previous=(await tx.get(operationRef)).data();
        if(previous?.state==='recontaminated')fail(409,'migration-requalification-required');
        if(!Array.isArray(plan.receiptIds || []) || (plan.receiptIds || []).length>20)fail(403,'invalid-plan');
        // Receipts must still correspond to retained server drafts.
        for (const receiptId of plan.receiptIds || []) {
          if (!idValid(receiptId)) fail(403, 'invalid-plan');
          const p = (await tx.get(db.doc(`cacheMigrationProvenance/${uid}/entries/${receiptId}`))).data();
          const ctx = await admitProof(req, tx, p);
          const r = await tx.get(db.doc(`cacheMigrationReceipts/${uid}/entries/${receiptId}`));
          const d = await tx.get(ctx.ref);
          if (!r.exists || !d.exists || digest(d.data().value) !== r.data().digest) fail(409, 'migration-receipt-conflict');
        }
        if (action === 'checkpoint') {
          const states = ['started','blocked','interrupted','local-verified-incomplete','recontaminated'];
          if (!states.includes(req.body.state)) fail(400, 'invalid-migration-state');
          tx.set(operationRef, {
            state: req.body.state, steps:[...(previous?.steps || []).slice(-19),req.body.state], protocol: PROTOCOL, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return {state: req.body.state, globalComplete: false, _writeCount:1};
        }
        return {targets: plan.targets, globalComplete: false};
      });
      const {_writeCount=0,...payload}=result;
      if(process.env.BYL_FIRESTORE_METRICS==='1')console.info('[byl-migration-writes]',JSON.stringify({action,documentWrites:_writeCount}));
      return res.json(payload);
    }
    fail(404, 'unknown-migration-action');
  } catch (error) {
    res.status(error.status || 500).json({error: error.status ? error.message : 'migration-unavailable'});
  }
});
module.exports = router;
