const {calculateCoachCredits}=require('./coachOfferCredits');
// Read the account document even before its first assignment. Touching it in the
// same transaction serializes bookings and contract edits for this coach.
async function prepareCoachCredit(db,tx,coachId,event){
 if(event.clubId)return ()=>{};
 const ref=db.collection('users').doc(coachId).collection('professional').doc('offers');
 const snap=await tx.get(ref),state=snap.data()||{contracts:[],checks:{},version:0};
 const service=(event.eventType||event.type)==='nutrition_appointment'?'nutrition':'coaching';
 const managed=(state.contracts||[]).filter(c=>c.clientId===(event.clientDocId||event.clientId)&&(!c.service||c.service===service||c.service==='mixed'));
 let contractId=null;
 if(event.creditMode!=='outside' && managed.length && !['annulée','cancelled','canceled'].includes(event.status)){
  const results=await Promise.all(['coachId','ownerId','createdBy'].map(k=>tx.get(db.collection('sessions').where(k,'==',coachId))));
  const sessions=[...new Map(results.flatMap(s=>s.docs).map(s=>[s.id,{...s.data(),id:s.id}])).values()].filter(s=>s.id!==event.id);
  const at=event.start?.toMillis?.()??new Date(event.start).getTime();
  const ledger=calculateCoachCredits(managed,sessions,coachId,at);
  const available=ledger.contracts.filter(c=>!['cancelled','ended'].includes(c.status)&&c.state!=='scheduled'&&c.available>0).sort((a,b)=>(a.expiresAt||'9999').localeCompare(b.expiresAt||'9999')||(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id));
  contractId=available.find(c=>c.id===event.coachContractId)?.id||available[0]?.id||null;
  if(!contractId)throw Object.assign(new Error('Aucune séance disponible à cette date. Attribuez ou renouvelez un pack avant de réserver.'),{status:409});
 }
 const commit=()=>tx.set(ref,{...state,creditRevision:(state.creditRevision||0)+1});
 commit.contractId=contractId;commit.creditMode=event.creditMode==='outside'||!managed.length?'outside':'auto';return commit;
}
module.exports={prepareCoachCredit};
