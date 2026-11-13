// Canonical request-local list, without persistent summaries or new writes.
const fields=['inputs.prenom','inputs.nom','inputs.objectif','inputs.objective','inputs.nutritionValidated','status','validated','clientShare','ration','foodSurvey','updatedAt','createdAt'];
function projection(doc,clientId){
 const data=doc.data();
 const date=value=>value?.toDate?.().toISOString() || value || null;
 return {id:doc.id,clientId,inputs:data.inputs||{},status:data.status||null,
  validated:!!data.validated,clientShare:data.clientShare||null,
  ration:data.ration?{}:null,foodSurvey:data.foodSurvey?{}:null,
  updatedAt:date(data.updatedAt),createdAt:date(data.createdAt)};
}
async function readNutritionList(tx,db,coachId,isActive=()=>true){
 const check=()=>{if(!isActive())throw Error('nutrition-request-closed');};
 check();
 const roots=await Promise.all([
  tx.get(db.collection('clients').where('createdBy','==',coachId).limit(500).select()),
  tx.get(db.collection('clients').where('coachId','==',coachId).limit(500).select()),
  tx.get(db.collection('clients').where('coachIds','array-contains',coachId).limit(500).select()),
 ]);
 const clients=[...new Map(roots.flatMap(s=>s.docs).map(d=>[d.id,d])).values()];
 const groups=new Array(clients.length);let next=0;
 await Promise.all(Array.from({length:Math.min(24,clients.length)},async()=>{
  while(next<clients.length){
   check();const index=next++,client=clients[index];
   const snap=await tx.get(client.ref.collection('nutrition_assessments').select(...fields));
   groups[index]=snap.docs.map(d=>projection(d,client.id));
  }
 }));
 return {clientCount:clients.length,rows:groups.flat()};
}
module.exports={readNutritionList,projection};
