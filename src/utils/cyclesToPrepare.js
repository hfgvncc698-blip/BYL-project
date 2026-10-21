import {cycleTimeline, syncCycleDurations} from './trainingCycles.js';
import {reconcileStartedCycle} from './reconcileStartedCycle.js';
import {currentCoachProgram} from './currentCoachProgram.js';
import {getProgramPlannedSessionTotal, getProgramValidatedSessionCount, readProgramActiveWeeks} from './programDuration.js';

const ms = value => typeof value === 'number' ? value : value?.toMillis?.() || (value?.seconds != null ? value.seconds*1000 : Date.parse(value)) || 0;
const day = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
const assigned = p => ms(p.assignedAt || p.createdAt || p._assignedAtMs);
const ready = p => p && p.status !== 'draft' && !p.excludeFromCyclePlanning && getProgramPlannedSessionTotal(p)>0;
const complete = p => p && getProgramPlannedSessionTotal(p)>0 && getProgramValidatedSessionCount(p)>=getProgramPlannedSessionTotal(p);

export function cyclesToPrepare(clients, now = new Date()) {
  const today=day(now), rows=[];
  for (const client of clients) {
    if (client.sportFollowView === 'programs') continue;
    const programs=client.programmesAssignes || [];
    let current, end, finished=false, cycle;
    if (client.trainingPlan?.cycles?.length) {
      const plan=reconcileStartedCycle(syncCycleDurations(client.trainingPlan,programs),programs);
      const timeline=cycleTimeline(plan);
      const cycles=plan.cycles;
      let index=cycles.findIndex(c=>!c.closedAt);
      // A closed cycle whose successor is still empty/draft needs preparation.
      if (index<0) index=cycles.length-1;
      else if (index>0 && !ready(programs.find(p=>p.id===cycles[index].programId))) index-=1;
      cycle=cycles[index];
      if (!cycle) continue;
      current=programs.find(p=>p.id===cycle.programId);
      finished=Boolean(cycle.closedAt)||complete(current);
      const next=programs.find(p=>p.id===cycles[index+1]?.programId);
      if (ready(next)) continue;
      end=timeline[index]?.end;
    } else {
      current=currentCoachProgram(client,programs.filter(p=>!p.excludeFromCyclePlanning));
      if (!current || !ready(current)) {
        rows.push({clientId:client.id,name:[client.prenom||client.firstName,client.nom||client.lastName].filter(Boolean).join(' ')||client.displayName||client.email||client.id,
          cycle:'',noCycle:true,finished:false,days:null,endMs:0});
        continue;
      }
      if (programs.some(p=>p.id!==current.id && ready(p) && assigned(p)>assigned(current))) continue;
      finished=complete(current);
      const start=ms(current.startedAt)||assigned(current);
      if (start) end=new Date(start+(readProgramActiveWeeks(current)*7-1)*86400000);
    }
    if (!current && !finished) continue;
    const endDate=typeof end==='string'?new Date(`${end}T12:00:00`):end;
    const days=endDate && Number.isFinite(endDate.getTime()) ? Math.round((day(endDate)-today)/86400000) : null;
    if (!finished && (days==null || days<0 || days>7)) continue;
    rows.push({clientId:client.id,name:[client.prenom||client.firstName,client.nom||client.lastName].filter(Boolean).join(' ')||client.displayName||client.email||client.id,
      cycle:current?.nomProgramme||current?.name||current?.title||'',finished,days,endMs:endDate?.getTime()||0});
  }
  return rows.sort((a,b)=>Number(b.finished)-Number(a.finished)||a.endMs-b.endMs||a.name.localeCompare(b.name));
}
