// Presentation/calculation contract only. Never write these exercise objects
// back as canonical prescriptions; the adjustment writer reads a transaction.
const exerciseFields = [
  'id','nom','name','title','label','__collection','collection',
  'Séries','series','séries','Répétitions','repetitions','répétitions','reps',
  'Repos (min:sec)','Repos','repos','pause','duree_repos','rest',
  'Durée (min:sec)','duree','durée','duree_effort','temps_effort','temps','time',
  'Charge (kg)','charge','poids','weight','Distance','distance','metrage','m','meters','metres','km',
  'Intensité','intensite','intensity','rpe','percent_1rm','Tempo','tempo','tempo_pattern','cadence',
  'optionsOrder','seriesDetails','series_sets','sets',
];
const sections=['echauffement','corps','bonus','retourCalme','exercises','exercices'];
const sessionFields=['id','name','nom','title','titre','label','sessionTitle','sessionName','nomSeance','libelle','duration','durationMin'];
function pick(value, fields){return Object.fromEntries(fields.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));}
export function dashboardSessionSummary(session) {
  if(!session || typeof session!=='object')return session;
  const result=pick(session,sessionFields);
  for(const section of sections)if(Array.isArray(session[section]))result[section]=session[section].map(exercise=>pick(exercise,exerciseFields));
  return result;
}
export function dashboardPrescriptionSummary(data) {
  const {description: _description,...result}=data;
  for(const field of ['sessions','seances']){
    if(Array.isArray(data[field]))result[field]=data[field].map(dashboardSessionSummary);
    else if(data[field] && typeof data[field]==='object')result[field]=Object.fromEntries(Object.entries(data[field]).map(([key,session])=>[key,dashboardSessionSummary(session)]));
  }
  return {...result,__dashboardPartial:true,__dashboardOutline:true};
}
