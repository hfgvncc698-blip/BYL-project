import {selectJourneyProgram} from './clientJourney.js';

export function currentCoachProgram(client, programs) {
  const available=programs.filter(p=>p.status!=='draft');
  const current=client.currentProgramme;
  const id=typeof current==='string'?current:current?.id;
  const selected = available.find(p=>p.id===id) || selectJourneyProgram(client,available);
  // A legacy cycle can remain open after its programme is complete. Only
  // actual activity in a newer assignment can supersede that stale selection;
  // merely assigning a future programme must not switch the dashboard.
  if (!selected || !(selected._total > 0 && selected._done >= selected._total)) return selected;
  const activity = p => Number(p._lastSessionMs || 0);
  const assigned = p => Number(p._assignedAtMs || p._createdAtMs || 0);
  const started = available.filter(p => p.id !== selected.id &&
    p._total > 0 && p._done < p._total && activity(p) > 0 &&
    activity(p) >= activity(selected) && assigned(p) > assigned(selected));
  return started.sort((a,b) => activity(b)-activity(a) || assigned(b)-assigned(a))[0] || selected;
}
