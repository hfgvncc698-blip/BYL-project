// Only merge the event returned after the server transaction commits. In
// particular a deduplicated request keeps the existing session's actual data.
export function mergeConfirmedCalendarEvents(previous, responses, coachId) {
  const confirmed = new Map();
  for (const response of responses) {
    const s = response?.ok && response.session;
    if (!s?.id || !s.clientId || s.coachId !== coachId || !['coach', 'both'].includes(s.visibility)) continue;
    const start = new Date(s.start), end = new Date(s.end);
    if (!s.start || !s.end || !Number.isFinite(+start) || !Number.isFinite(+end)) continue;
    const validated = s.validated || ['validée', 'validee', 'done', 'completed'].includes(s.status);
    confirmed.set(s.id, {
      id: `planned__${s.id}`, _sourceId: s.id, _kind: 'planned',
      title: [s.clientName, s.programTitle, s.title].filter(Boolean).join(' - '),
      start, end, status: validated ? 'validée' : s.status, visibility: s.visibility,
      clientId: s.clientId, programmeId: s.programmeId, sessionIndex: s.sessionIndex,
      eventType: s.eventType, appointmentKind: s.appointmentKind, durationMin: s.durationMin,
      _clientName: s.clientName, _programmeName: s.programTitle, _sessionTitle: s.title,
      _rootCoachValidated: Boolean(validated),
    });
  }
  if (!confirmed.size) return previous;
  return [...previous.filter(event => !confirmed.has(event._sourceId) && !confirmed.has(String(event.id).replace(/^planned__/, ''))), ...confirmed.values()]
    .sort((a, b) => +a.start - +b.start);
}
