function serializeConfirmedSession(id, data) {
  const iso = value => value?.toDate?.().toISOString() || null;
  return {
    id, clientId: data.clientId, clientName: data.clientName || '',
    title: data.title || '', programTitle: data.programTitle || data.programmeName || data.programName || '',
    programmeId: data.programmeId || data.programId || '', sessionIndex: data.sessionIndex ?? null,
    start: iso(data.start), end: iso(data.end), status: data.status || 'à venir',
    visibility: data.visibility || 'coach', eventType: data.eventType || data.type || 'sport_session',
    appointmentKind: data.appointmentKind || '', durationMin: data.durationMin ?? null,
    coachId: data.coachId || data.createdBy || '',
    validated: Boolean(data.validatedAt || data.completedAt),
  };
}
module.exports = { serializeConfirmedSession };
