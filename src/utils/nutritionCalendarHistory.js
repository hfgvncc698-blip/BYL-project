import { matchingNutritionAppointment } from './nutritionAssessmentCalendar.js';
const date = value => value?.toDate?.() || (value?.seconds ? new Date(value.seconds * 1000) : new Date(value));

// Include older assessments without creating another stored appointment. A
// validated assessment completes its linked calendar entry, never a second one.
export function nutritionCalendarHistory(sessions, rows, clients, coachId, titleFor) {
  const result = sessions.map(event => ({...event}));
  const claimed = new Set();
  const clientsById = new Map(clients.map(client => [client.id, client]));
  for (const row of rows) {
    const valid = row.validated === true || row.status === 'final' || row.inputs?.nutritionValidated === true;
    if (!valid) continue;
    const owner = row.createdBy || row.coachId || row.coachUid;
    if (owner && owner !== coachId) continue;
    const at = date(row.createdAt || row.validatedAt || row.updatedAt);
    if (!Number.isFinite(at.getTime())) continue;
    const client = clientsById.get(row.clientId);
    if (!client) continue;
    let index = result.findIndex(event => !claimed.has(event.id) && event.clientId === row.clientId &&
      ((row.calendarEventId && event._sourceId === row.calendarEventId) || event.assessmentId === row.id));
    if (index < 0) {
      const match = matchingNutritionAppointment(result.filter(event => !claimed.has(event.id)).map(event => ({...event, coachId:event.coachId || coachId})),
        {clientId:row.clientId,coachId,at});
      if (match) index = result.findIndex(event => event.id === match.id);
    }
    const name = [client.prenom || client.firstName, client.nom || client.lastName].filter(Boolean).join(' ') || client.fullName || client.name || row.clientId;
    const title = titleFor(name);
    const source = index >= 0 ? result[index] : {
      id:`nutrition_history__${row.clientId}__${row.id}`, start:at, end:new Date(at.getTime()+30*60000),
      clientId:row.clientId, eventType:'nutrition_appointment', title, _sessionTitle:title, _clientName:name,
    };
    // An explicitly cancelled appointment stays cancelled; record the completed
    // assessment independently instead of silently undoing the cancellation.
    if (['annulée','annulee','cancelled','canceled'].includes(source.status)) continue;
    const completed = {...source,status:'validée',_kind:'completed',assessmentId:row.id,nutritionAssessmentHistory:true};
    if (index >= 0) result[index] = completed;
    else result.push(completed);
    claimed.add(completed.id);
  }
  return result;
}
