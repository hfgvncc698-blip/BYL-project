// Exact, request-local projection. No persisted view and no history reads.
const clientFields=['prenom','nom','firstName','lastName','fullName','name','displayName','email',
  'sportProgramCount','programmesSportifs','programmesCount','programmeCount','nbProgrammes','trainingPlan'];
const programFields=['programId','programID','baseId','nomProgramme','objectifUI','objectif','origine','nbSeances','sessions','seances'];
function clientProjection(doc){
  const data=doc.data(),result={id:doc.id};
  for(const key of clientFields)if(data[key]!==undefined && key!=='trainingPlan')result[key]=data[key];
  if(Array.isArray(data.trainingPlan?.cycles))result.trainingPlan={cycles:data.trainingPlan.cycles.map(c=>({draftProgramId:c.draftProgramId || null}))};
  return result;
}
function needsPrograms(c){
  const count=[c.sportProgramCount,c.programmesSportifs,c.programmesCount,c.programmeCount,c.nbProgrammes].map(Number).find(Number.isFinite);
  return !Number.isFinite(count) || count>0;
}
function programProjection(doc){
  const data=doc.data(),{sessions,seances,...result}=data;
  result.id=doc.id;
  result.nbSeances=Array.isArray(sessions)?sessions.length:typeof data.nbSeances==='number'?data.nbSeances:Array.isArray(seances)?seances.length:0;
  return result;
}
async function readAssignments(tx,db,coachId,isActive=()=>true){
  const check=()=>{if(!isActive())throw new Error('assignment-request-closed');};
  check();
  // Retain the existing per-owner limits and query order, including old schemas.
  const snapshots=await Promise.all([
    tx.get(db.collection('clients').where('createdBy','==',coachId).limit(200).select(...clientFields)),
    tx.get(db.collection('clients').where('coachId','==',coachId).limit(200).select(...clientFields)),
    tx.get(db.collection('clients').where('coachIds','array-contains',coachId).limit(200).select(...clientFields)),
  ]);
  const docs=[...new Map(snapshots.flatMap(s=>s.docs).map(d=>[d.id,d])).values()];
  const clients=docs.map(clientProjection),assignments=Object.create(null);
  let next=0;
  const selected=docs.filter((d,i)=>needsPrograms(clients[i]));
  await Promise.all(Array.from({length:Math.min(24,selected.length)},async()=>{
    while(next<selected.length){
      check();
      const d=selected[next++];
      const programs=await tx.get(d.ref.collection('programmes').select(...programFields));
      assignments[d.id]=programs.docs.map(programProjection);
    }
  }));
  return {clients,assignments};
}
module.exports={readAssignments,clientProjection,programProjection,needsPrograms};
