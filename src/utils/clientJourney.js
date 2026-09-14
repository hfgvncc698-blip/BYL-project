import { isSessionValidatedRecord } from './sessionCompletion.js';
import { getProgramPlannedSessionTotal } from './programDuration.js';

export const journeyTime = value => {
  const result = value?.toMillis?.() ?? (value?.seconds != null ? value.seconds * 1000 : Date.parse(value));
  return Number.isFinite(result) ? result : 0;
};
export const journeyRecordTime = record => journeyTime(record.completedAt || record.validatedAt || record.dateEffectuee || record.updatedAt || record.createdAt);
export const journeySessions = program => program?.sessions || program?.seances || [];
export const journeyName = program => program?.nomProgramme || program?.name || program?.title || '';
export const isJourneyValidated = record => isSessionValidatedRecord(record) && Boolean(
  ['validée','validee','terminée','terminee','done','completed'].includes(String(record.status || '').toLowerCase()) ||
  record.validated || record.isValidated || record.dateEffectuee || record.completedAt || record.validatedAt || record.finishedAt || record.playedAt
);

// Never promote a future draft or fall back to an old programme while a cycle is waiting.
export function selectJourneyProgram(profile, programs) {
  const available = programs.filter(p => p.status !== 'draft');
  if (profile?.sportFollowView !== 'programs' && profile?.trainingPlan?.cycles?.length) {
    const current = profile.trainingPlan.cycles.find(c => !c.closedAt);
    return available.find(p => p.id === current?.programId) || null;
  }
  return available.find(p => p.id === profile?.currentProgramme) || [...available].sort((a,b) =>
    journeyTime(b.assignedAt || b.createdAt) - journeyTime(a.assignedAt || a.createdAt))[0] || null;
}

export function journeyProgress(program, records = []) {
  const ordered = [...records].sort((a,b) => journeyRecordTime(a) - journeyRecordTime(b));
  const validated = ordered.filter(isJourneyValidated);
  const total = getProgramPlannedSessionTotal(program || {});
  const complete = total > 0 && validated.length >= total;
  const latest = ordered.at(-1);
  const size = journeySessions(program).length;
  const indexOf = record => Number(record?.sessionIndex ?? record?.seanceIndex ?? record?.index);
  const lastIndex = indexOf(validated.at(-1));
  const resume = !complete && latest && !isJourneyValidated(latest) && Number(latest.pourcentageTermine) > 0 && Number.isInteger(indexOf(latest)) && indexOf(latest) >= 0 && indexOf(latest) < size ? latest : null;
  const nextIndex = resume ? indexOf(resume) : size ? (Number.isInteger(lastIndex) ? lastIndex + 1 : validated.length) % size : 0;
  return { total, done: validated.length, complete, resume, nextIndex, validated };
}

export function isCoachedJourney(profile, programs) {
  return programs.length > 0 && Boolean(profile?.coachIds?.length || profile?.coachId || profile?.trainingPlan?.cycles?.length);
}
