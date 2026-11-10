import { apiFetch } from './api';
import {getProgramPlannedSessionTotal,getProgramValidatedSessionCount} from './programDuration';

export function listMetrics(row) {
  let total=0, completed=0;
  for(const meta of row.programs) {
    const planned=getProgramPlannedSessionTotal(meta), done=getProgramValidatedSessionCount(meta);
    total+=planned; completed+=planned>0 ? Math.min(done,planned) : done;
  }
  completed=Math.min(completed,total);
  return { progress:{total,completed,percent:total?Math.min(100,Math.round(completed/total*100)):0},
    programmeCount:row.programs.length,sessionsPerWeek:row.week,lastSessionDate:row.lastMs?new Date(row.lastMs):null,
    _lastInteractionMs:row.lastMs,nutritionCount:row.assessmentCount,nutritionLast:row.nutritionLast };
}

const getCompletedDate = (s) => {
  const d =
    s?.dateEffectuee?.toDate?.() ||
    s?.completedAt?.toDate?.() ||
    s?.playedAt?.toDate?.() ||
    s?.timestamp?.toDate?.() ||
    s?.date?.toDate?.() ||
    s?.validatedAt?.toDate?.() ||
    s?.startedAt?.toDate?.() ||
    s?.endedAt?.toDate?.() ||
    s?.endAt?.toDate?.() ||
    s?.finishedAt?.toDate?.() ||
    s?.updatedAt?.toDate?.() ||
    s?.createdAt?.toDate?.() ||
    (typeof s?.dateEffectuee === "string" ? new Date(s.dateEffectuee) : null) ||
    (typeof s?.completedAt === "string" ? new Date(s.completedAt) : null) ||
    (typeof s?.playedAt === "string" ? new Date(s.playedAt) : null) ||
    (typeof s?.timestamp === "string" ? new Date(s.timestamp) : null) ||
    (typeof s?.date === "string" ? new Date(s.date) : null) ||
    (typeof s?.validatedAt === "string" ? new Date(s.validatedAt) : null) ||
    (typeof s?.startedAt === "string" ? new Date(s.startedAt) : null) ||
    (typeof s?.endedAt === "string" ? new Date(s.endedAt) : null) ||
    (typeof s?.endAt === "string" ? new Date(s.endAt) : null) ||
    (typeof s?.finishedAt === "string" ? new Date(s.finishedAt) : null) ||
    (typeof s?.updatedAt === "string" ? new Date(s.updatedAt) : null) ||
    (typeof s?.createdAt === "string" ? new Date(s.createdAt) : null) ||
    null;

  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
};

async function localSport(source,c) {
  const version=JSON.stringify(c.dashboardProgramRevision);
  const bundle=await source.peek('bundle/'+c.id,version);
  if(!bundle)return null;
  const programs=bundle.programs;
  const sums=[];
  let last=0,week=0;
  const since=new Date();since.setDate(since.getDate()-7);
  for(const doc of programs.docs) {
    const history=bundle.histories.get(doc.id);
    if(!history)return null;
    const data=history.docs.map(d=>d.data());
    for(const row of data) {
      if(typeof row.pourcentageTermine==='number' && row.pourcentageTermine<90)continue;
      const date=getCompletedDate(row);
      if(date){last=Math.max(last,date.getTime());if(date>=since)week++;}
    }
    sums.push({...doc.data(),sessionsEffectuees:data});
  }
  return listMetrics({programs:sums,lastMs:last,week});
}

// One request for the missing summaries in this page. Fresh entries and
// concurrent callers share promises, including when a different filter mounts.
export async function listBatch(source,coachId,clients,sport,changedId) {
  const locally=await Promise.all(clients.map(c=>sport?localSport(source,c):null));
  const groups=new Map();
  function request(id,needSport) {
    const group=groups.get(needSport) || {ids:[]};
    groups.set(needSport,group);
    group.ids.push(id);
    group.promise ||= Promise.resolve().then(()=>{
      const since=new Date();since.setDate(since.getDate()-7);
      return apiFetch('/programs/client-list-summary',{method:'POST',signal:typeof AbortSignal.any==='function' && typeof AbortSignal.timeout==='function' ? AbortSignal.any([source.signal,AbortSignal.timeout(45000)]) : undefined,body:JSON.stringify({coachId,ids:group.ids,sport:needSport,since:since.getTime(),refreshId:changedId})});
    });
    return group.promise.then(response=>listMetrics(response.summaries[id]));
  }
  return Promise.all(clients.map((c,i)=>source.read('list/'+sport+'/'+c.id,
    JSON.stringify([c.dashboardProgramRevision,c.dashboardNutritionRevision]),async()=>{
      const nutrition=await source.peek('nutrition-list/'+c.id,JSON.stringify(c.dashboardNutritionRevision));
      if(locally[i] && nutrition)return {...locally[i],...nutrition};
      const summary=await request(c.id,sport && !locally[i]);
      return locally[i] ? {...locally[i],nutritionCount:summary.nutritionCount,nutritionLast:summary.nutritionLast} : summary;
    },c.id)));
}
