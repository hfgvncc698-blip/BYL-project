const asDate = value => value?.toDate?.() || new Date(value);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function matchingNutritionAppointment(events, { clientId, coachId, at }) {
  return events.filter(event => {
    const start = asDate(event.start || event.startsAt);
    return (event.coachId || event.coachUid || event.createdBy) === coachId &&
      (event.clientDocId || event.clientId) === clientId &&
      [event.eventType, event.type].includes('nutrition_appointment') &&
      !event.assessmentId && !event.autoNutritionAssessment &&
      !['annulée','annulee','cancelled','canceled','manquée','manquee'].includes(event.status) &&
      Number.isFinite(start.getTime()) && sameDay(start, at);
  }).sort((a, b) => Math.abs(asDate(a.start || a.startsAt) - at) - Math.abs(asDate(b.start || b.startsAt) - at))[0] || null;
}

export function nutritionAssessmentEvent({ clientId, coachId, assessmentId, clientName, title, at, clubId = null }) {
  return {
    clientId, clientDocId: clientId, coachId, createdBy: coachId, assessmentId,
    clientName, title, sessionTitle: title,
    type: 'nutrition_appointment', eventType: 'nutrition_appointment', appointmentKind: 'bilan',
    start: at, end: new Date(at.getTime() + 30 * 60000), durationMin: 30,
    status: 'à venir', visibility: 'coach', noNotify: true, creditMode: 'outside',
    autoNutritionAssessment: true, clubId,
  };
}

// Transaction reads precede all writes. The appointment and assessment are
// committed together, and a retried creation cannot make a second event.
export async function commitNutritionAssessment(tx, { assessmentRef, autoEventRef, candidates, payload, event, stamp }) {
  const assessment = await tx.get(assessmentRef);
  if (assessment.exists()) return;
  const snapshots = await Promise.all(candidates.map(ref => tx.get(ref)));
  const selected = matchingNutritionAppointment(snapshots.filter(s => s.exists()).map(s => ({...s.data(), id:s.id, ref:s.ref})),
    {clientId:event.clientId, coachId:event.coachId, at:event.start});
  const eventRef = selected?.ref || autoEventRef;
  tx.set(assessmentRef, {...payload, calendarEventId:eventRef.id, calendarEventSource:selected ? 'existing' : 'automatic'});
  if (selected) tx.update(eventRef, {assessmentId:assessmentRef.id, updatedAt:stamp});
  else tx.set(eventRef, {...event, createdAt:stamp, updatedAt:stamp});
}
