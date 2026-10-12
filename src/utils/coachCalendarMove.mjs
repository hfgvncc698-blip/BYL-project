import { calendarEventValidated } from './calendarEventAppearance.mjs';
export function canMoveCoachCalendarEvent(event, coachUid, now = Date.now()) {
  if (!event || calendarEventValidated(event, now)) return false;
  if (['annulée', 'annulee', 'cancelled', 'canceled', 'manquée', 'manquee'].includes(event.status)) return false;
  if (event._kind === 'club_appointment') return event.type === 'group' && event.coachUid === coachUid;
  return event._kind === 'planned';
}
export function coachCalendarMoveRequest(event, start, end, notifyClient = false) {
  const id = event._sourceId || String(event.id || '').replace(/^planned__|^club__/, '');
  if (event._kind === 'club_appointment') return {
    path: `/clubs/appointments/${encodeURIComponent(id)}`,
    body: { startsAt: start.toISOString(), durationMin: Math.round((end - start) / 60000) },
  };
  return { path: `/coach-sessions/${encodeURIComponent(id)}/schedule`, body: { start: start.toISOString(), end: end.toISOString(), notifyClient } };
}
