import { journeyRecordTime, journeyTime } from './clientJourney.js';
import { currentCoachProgram } from './currentCoachProgram.js';
import { getProgramPlannedSessionTotal, getProgramValidatedSessionCount } from './programDuration.js';
import { isSessionValidatedRecord } from './sessionCompletion.js';

// Only compare explicit links and complete reads. Missing legacy links are not errors.
export function diagnoseClient(profile, programs, events) {
  const issues = [];
  const enriched = programs.map(p => ({ ...p, _done: getProgramValidatedSessionCount(p), _total: getProgramPlannedSessionTotal(p), _lastSessionMs: Math.max(0, ...(p._progressSessionsEffectuees || []).map(journeyRecordTime)), _assignedAtMs: journeyTime(p.assignedAt || p.createdAt) }));
  const current = currentCoachProgram(profile, enriched);
  const pointer = typeof profile.currentProgramme === 'string' ? profile.currentProgramme : profile.currentProgramme?.id;
  if (pointer && current && pointer !== current.id) issues.push({ code: 'pointer', programId: current.id });
  for (const p of enriched) {
    for (const field of ['doneCount', 'completedSessions']) {
      if (typeof p[field] === 'number' && p[field] !== p._done) {
        issues.push({ code: 'count', programId: p.id, actual: p._done, stored: p[field] });
        break;
      }
    }
    for (const s of p._progressSessionsEffectuees || []) {
      if (!s.calendarEventId || !isSessionValidatedRecord(s)) continue;
      const event = events.get(s.calendarEventId);
      if (!event) issues.push({ code: 'missingEvent', programId: p.id, sessionId: s.id });
      else if ((event.programmeId || event.programId) && (event.programmeId || event.programId) !== p.id) issues.push({ code: 'wrongProgram', programId: p.id, sessionId: s.id });
      else if (!isSessionValidatedRecord(event)) issues.push({ code: 'status', programId: p.id, sessionId: s.id });
      else {
        const rating = s.difficultyRating ?? s.rating;
        if (rating != null && Number(rating) !== Number(event.difficultyRating ?? event.rating)) issues.push({ code: 'rating', programId: p.id, sessionId: s.id });
      }
    }
  }
  return { current, issues };
}

export function authState(status) {
  if (!status) return 'unknown';
  if (status.notFound) return 'missing';
  if (status.disabled) return 'disabled';
  return 'enabled';
}
