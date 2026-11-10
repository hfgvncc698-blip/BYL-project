// An appointment ID is unique only within its club. A dossier or session ID
// supplied by an appointment is a lookup key, never an authorization grant.
function visibleClubSession(clubId, session, client) {
  if (!session || !client || session.clubId !== clubId) return false;
  if (client.deletedFromClub || client.disabledByClub || client.disabled || ['deleted','removed','disabled','inactive','club_deleted'].includes(client.status)) return false;
  const primaryClub = client.clubId || client.club?.id;
  if (primaryClub !== clubId && !(Array.isArray(client.clubIds) && client.clubIds.includes(clubId))) return false;
  return !session.clientPrivate && (!session.visibility || ['both','club'].includes(session.visibility));
}

function visibleAppointmentSession(clubId, appointmentId, event, session, client) {
  if (!visibleClubSession(clubId, session, client) || session.clubAppointmentId !== appointmentId) return false;
  if (!event.clientId || (session.clientDocId || session.clientId) !== event.clientId) return false;
  // Some older sessions carry the account UID alongside the canonical dossier ID.
  return !session.clientId || session.clientId === event.clientId ||
    [client.authUid, client.accountUid, client.linkedUserId, client.userId, client.uid].includes(session.clientId);
}

function validLink(id) {
  return typeof id === 'string' && id.length > 0 && !id.includes('/');
}

async function readAppointmentSession(db, clubId, id, event, reader = db) {
  if (!validLink(event.linkedSessionId) || !validLink(event.clientId)) return null;
  const [session, client] = await reader.getAll(db.collection('sessions').doc(event.linkedSessionId),
    db.collection('clients').doc(event.clientId));
  return visibleAppointmentSession(clubId, id, event, session.data(), client.data()) ? session.data() : null;
}

module.exports = {visibleClubSession, visibleAppointmentSession, readAppointmentSession, validLink};
