import { selectJourneyProgram } from './clientJourney.js';
export function dashboardCycle(profile, programs = []) {
  if (profile?.sportFollowView === 'programs' || !profile?.trainingPlan?.cycles?.length) return null;
  const cycle = profile.trainingPlan.cycles.find(c => !c.closedAt);
  if (!cycle) return {state:'finished',program:null};
  const program = selectJourneyProgram(profile, programs);
  if (!program) return {state:'waiting',program:null};
  const complete = Number(program._total)>0 && Number(program._done)>=Number(program._total);
  return {state:complete?'transition':'active',program:complete?null:program};
}
