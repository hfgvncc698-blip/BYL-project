const express = require('express');
const crypto = require('node:crypto');
const {authorizedDraft,version,fail} = require('../utils/programDraftAccess');
const admin = require('../firebaseAdmin');
const {requireUnrevokedFirebaseAuth} = require('../utils/firebaseAuth');
const router = express.Router();
router.use(requireUnrevokedFirebaseAuth);
router.post('/:action', async (req,res) => {
  res.set('Cache-Control','private, no-store');
  try {
    const {action}=req.params;
    if(!['read','save','complete'].includes(action))fail(404,'unknown-draft-action');
    const target=req.body?.target||{}, db=admin.firestore();
    const result=await db.runTransaction(async tx=>{
      const {ref,snap,scope,coachId,programId,clientId}=await authorizedDraft(req,tx,target);
      const saved=await tx.get(ref), data=saved.data(), revision=data?.revision||0;
      if(action==='read')return {scope,baseVersion:version(snap),revision,draft:data?.scope===scope?data:null};
      if(req.body.scope!==scope)fail(403,'draft-scope-changed');
      const body=req.body;
      if(action==='complete'){
        if(body.revision!==revision)fail(409,'draft-conflict');
        if(saved.exists)tx.delete(ref);
        return {ok:true};
      }
      if(typeof body.operationId!=='string'||!/^[a-zA-Z0-9-]{10,80}$/.test(body.operationId))fail(400,'invalid-draft-operation');
      if(!body.value || typeof body.value!=='object' || Array.isArray(body.value))fail(400,'invalid-draft-value');
      const encoded=JSON.stringify(body.value);
      if(Buffer.byteLength(encoded)>700000)fail(413,'draft-too-large');
      const digest=crypto.createHash('sha256').update(JSON.stringify([body.baseVersion,body.revision,body.value])).digest('hex');
      if(data?.operationId===body.operationId){
        if(data.digest!==digest)fail(409,'operation-body-conflict');
        return {revision,baseVersion:data.baseVersion};
      }
      if(body.revision!==revision||body.baseVersion!==version(snap))fail(409,'draft-conflict');
      const next={value:body.value,baseVersion:body.baseVersion,scope,revision:revision+1,operationId:body.operationId,digest,
        target:{coachId,clientId,programId},updatedAt:admin.firestore.FieldValue.serverTimestamp()};
      tx.set(ref,next);
      return {revision:revision+1,baseVersion:next.baseVersion};
    });
    res.json(result);
  }catch(error){res.status(error.status||500).json({error:error.status?error.message:'draft-unavailable'});}
});
module.exports=router;
