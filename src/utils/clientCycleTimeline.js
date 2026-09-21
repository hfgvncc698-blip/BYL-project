import {readProgramActiveWeeks} from './programDuration.js';
import {selectJourneyProgram} from './clientJourney.js';
import {initialCyclePreparation} from './initialCyclePreparation.js';
import {reconcileStartedCycle} from './reconcileStartedCycle.js';
const time=value=>value?.toMillis?.()||(value?.seconds?value.seconds*1000:Date.parse(value))||0;
function inferredType(program) {
  if(program.cycleType)return program.cycleType;
  const value=String(program.objectifUI||program.objectif||program.nomProgramme||program.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/recuper|recovery|deload/.test(value))return 'recovery';
  if(/endurance/.test(value))return 'endurance';
  if(/hypertroph|masse|muscl/.test(value))return 'hypertrophy';
  if(/force|strength/.test(value))return 'strength';
  if(/preparation/.test(value))return 'general';
  return 'custom';
}
// Reconstruct the visible history without writing an execution order or changing
// the active programme. Unlinked programmes are available, not promised next steps.
export function clientCycleTimeline(profile,programs=[]) {
  if(profile?.sportFollowView==='programs')return [];
  const cycles=reconcileStartedCycle(initialCyclePreparation(profile?.trainingPlan),programs)?.cycles||[];
  const activeId=cycles.find(c=>!c.closedAt)?.id;
  const linked=cycles.flatMap(cycle=>{
    const program=programs.find(p=>p.id===cycle.programId && p.status!=='draft' && !p.excludeFromCyclePlanning);
    if(!program)return [];
    return [{id:cycle.id,type:cycle.type==='custom'?inferredType(program):cycle.type,name:cycle.name||cycle.nom||'',weeks:cycle.weeks,program,
      state:cycle.closedAt?'completed':cycle.id===activeId?'current':'upcoming'}];
  });
  const currentId=cycles.length?cycles.find(c=>c.id===activeId)?.programId:selectJourneyProgram(profile,programs)?.id;
  const current=programs.find(p=>p.id===currentId);
  const currentTime=time(current?.assignedAt||current?.createdAt);
  const referenced=new Set(cycles.flatMap(c=>[c.programId,c.draftProgramId]).filter(Boolean));
  const extra=programs.filter(p=>!referenced.has(p.id)&&p.status!=='draft'&&!p.excludeFromCyclePlanning).map(program=>({
    id:`history:${program.id}`,type:inferredType(program),name:'',weeks:readProgramActiveWeeks(program),program,
    state:program.id===currentId?'current':currentTime && time(program.assignedAt||program.createdAt)>0 && time(program.assignedAt||program.createdAt)<currentTime?'past':'available',
  })).sort((a,b)=>time(a.program.assignedAt||a.program.createdAt)-time(b.program.assignedAt||b.program.createdAt)||a.program.id.localeCompare(b.program.id));
  const result = [...extra.filter(c=>c.state==='past'),...linked,...extra.filter(c=>c.state!=='past')];
  if (!cycles.length && result[0]?.type === 'endurance' && !result[0].program.cycleType) result[0] = { ...result[0], type: 'general' };
  return result;
}
