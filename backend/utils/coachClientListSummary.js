// Listing projections. No exercise bodies, client notes or completion records are
// sent to the browser. Reads and authorization share one consistent snapshot.
const programFields = ['sessionCount','totalSessions','nbSeances','_total','_done','_progressSessionsEffectuees','doneCount','completedSessions',
  'nomProgramme','name','title','sessionsPerWeek','seancesParSemaine','nbSeancesSemaine','nbSeancesParSemaine','sessions_per_week',
  'activeWeeks','durationWeeks','programDurationWeeks','dureeSemaines','weeksActive'];
const dates = ['dateEffectuee','completedAt','playedAt','timestamp','date','validatedAt','startedAt','endedAt','endAt','finishedAt','updatedAt','createdAt'];
const historyFields = [...dates,'status','isPartial','validated','isValidated','pourcentageTermine','completionPct','completionPercent'];
function completionDate(row) {
  for(const field of dates) if(row[field]?.toMillis) return row[field].toMillis();
  for(const field of dates) if(typeof row[field]==='string') return Date.parse(row[field]) || 0;
  return 0;
}
function validated(row) {
  const status=String(row.status || '').trim().toLowerCase();
  if(row.isPartial===true || ['en_cours','in_progress','partial'].includes(status)) return false;
  return ['validée','validee','terminée','terminee','done','completed'].includes(status) || row.validated===true || row.isValidated===true ||
    Boolean(row.dateEffectuee || row.completedAt || row.validatedAt || row.finishedAt || row.playedAt) ||
    (Number.isFinite(Number(row.pourcentageTermine ?? row.completionPct ?? row.completionPercent)) && Number(row.pourcentageTermine ?? row.completionPct ?? row.completionPercent)>=90);
}
// Share a bounded query budget across the entire page, not one serial queue
// per dossier. This preserves the queried documents and the transaction snapshot.
function createReadScheduler(tx, limit = 25) {
  const queue = [];
  let active = 0;
  const drain = () => {
    while (active < limit && queue.length) {
      const {query, resolve, reject} = queue.shift();
      active++;
      Promise.resolve().then(() => tx.get(query)).then(resolve, reject).finally(() => {
        active--;
        drain();
      });
    }
  };
  return query => new Promise((resolve, reject) => {
    queue.push({query, resolve, reject});
    drain();
  });
}
async function summarize(read,ref,since,{sport,nutrition}) {
  const programs=sport ? await read(ref.collection('programmes').select(...programFields,'sessions','seances')) : {docs:[]};
  let lastMs=0;const recent=[];
  const result=await Promise.all(programs.docs.map(async doc => {
    const {sessions,seances,...meta}=doc.data();
    if(Array.isArray(sessions) || Array.isArray(seances)) meta._total=(Array.isArray(sessions)?sessions:seances).length;
    const history=await read(doc.ref.collection('sessionsEffectuees').select(...historyFields));
    if(history.size) meta._done=0;
    for(const row of history.docs){
      const data=row.data();
      if(validated(data)) meta._done++;
      if(typeof data.pourcentageTermine==='number' && data.pourcentageTermine<90) continue;
      const ms=completionDate(data);
      lastMs=Math.max(lastMs,ms);
      if(ms>=since) recent.push(ms);
    }
    if(Array.isArray(meta._progressSessionsEffectuees))meta._done=meta._progressSessionsEffectuees.filter(validated).length;
    delete meta._progressSessionsEffectuees;
    const frequency=`${meta.nomProgramme || ''} ${meta.name || ''} ${meta.title || ''}`.match(/(\d+)\s*(?:x|fois|séances?|seances?)\s*(?:\/|par)?\s*(?:sem|semaine|week)/i);
    if(Number(frequency?.[1])>0)meta.sessionsPerWeek=Number(frequency[1]);
    delete meta.nomProgramme;delete meta.name;delete meta.title;
    const numeric={};
    for(const [key,value] of Object.entries(meta)){
      if(value==null)continue;
      if(['_total','sessionCount','totalSessions','nbSeances','_done','doneCount','completedSessions'].includes(key) && typeof value!=='number')continue;
      const converted=Number(value);
      numeric[key]=Number.isFinite(converted) ? converted : 0;
    }
    return numeric;
  }));
  let assessmentCount=null, nutritionLast=0;
  if(nutrition){
    const assessments=await read(ref.collection('nutrition_assessments').select('sharedAt','updatedAt','createdAt','date'));
    assessmentCount=assessments.size;
    for(const doc of assessments.docs) for(const value of Object.values(doc.data())){
      const ms=value?.toMillis?.() ?? (typeof value==='number' ? (value>1e12?value:value*1000) : Date.parse(value));
      if(Number.isFinite(ms)) nutritionLast=Math.max(nutritionLast,ms);
    }
  }
  return {programs:result,lastMs,recent,assessmentCount,nutritionLast};
}
// No private view is read until the transaction has authorized every dossier.
// All reads finish before the first write, including under concurrent rebuilds.
async function readListSummaries(db,tx,docs,since,options,refreshId) {
  const persistent=process.env.BYL_COACH_LIST_VIEWS!=='off';
  const variant='v1-'+Number(options.sport)+'-'+Number(options.nutrition);
  const views=docs.map(doc=>db.collection('coachPageLists').doc(doc.id).collection('coachClientListViews').doc(variant));
  const saved=persistent ? await tx.getAll(...views) : [];
  const pending=[];
  const read=createReadScheduler(tx);
  const rows=await Promise.all(docs.map(async(doc,i)=>{
    const entry=saved[i]?.data();
    const now=Date.now();
    const usable=entry && doc.updateTime.isEqual(entry.version) && since>=entry.since &&
      now-entry.at<3600000 && refreshId!==doc.id;
    let data=entry?.data;
    if(!usable){
      const earliest=Math.min(since,now-8*86400000);
      data=await summarize(read,doc.ref,earliest,options);
      if(persistent && Buffer.byteLength(JSON.stringify(data))<=128*1024)
        pending.push([views[i],{version:doc.updateTime,at:now,since:earliest,data}]);
    }
    const {recent,...metrics}=data;
    return [doc.id,{...metrics,week:recent.filter(ms=>ms>=since).length}];
  }));
  for(const [ref,entry] of pending)tx.set(ref,entry);
  return Object.fromEntries(rows);
}
module.exports={readListSummaries,validated};
