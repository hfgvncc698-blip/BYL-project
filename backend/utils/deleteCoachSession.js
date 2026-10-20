const fail = (status, message) => Object.assign(new Error(message), { status });

function createDeleteCoachSession({ db, isAdminRole, hasActiveProfessionalAccess, clientBelongsToCoach, prepareCoachCredit }) {
  return async (uid, token, id) => {
    if (!uid) throw fail(401, 'Connexion requise.');
    if (typeof id !== 'string' || !id || id.includes('/')) throw fail(400, 'Séance invalide.');
    return db.runTransaction(async tx => {
      const ref = db.collection('sessions').doc(id);
      const [userSnap, sessionSnap] = await Promise.all([
        tx.get(db.collection('users').doc(uid)), tx.get(ref),
      ]);
      const user = userSnap.data() || {};
      const admin = isAdminRole(user.role || token?.role) && token?.email_verified === true;
      if (!admin && !hasActiveProfessionalAccess(user, token || {})) throw fail(403, 'Accès professionnel requis.');
      if (!sessionSnap.exists) throw fail(404, 'Cette séance n’existe plus.');
      const session = sessionSnap.data();
      const coachId = session.coachId || session.ownerId || session.createdBy;
      if (!admin && coachId !== uid) throw fail(403, 'Vous ne pouvez pas supprimer cette séance.');
      if (session.clubId || session.clubAppointmentId) throw fail(400, 'Utilisez le planning du club.');
      if (['validée', 'validee', 'done', 'completed'].includes(session.status) || session.completedAt || session.validatedAt) {
        throw fail(409, 'Impossible de supprimer une séance déjà validée.');
      }
      const clientId = session.clientDocId || session.clientId;
      if (typeof clientId !== 'string' || !clientId || clientId.includes('/')) throw fail(400, 'Client invalide.');
      const clientRef = db.collection('clients').doc(clientId);
      const client = await tx.get(clientRef);
      if (!admin && (!client.exists || !clientBelongsToCoach(client.data(), user, uid))) throw fail(403, 'Accès au client refusé.');
      if (!coachId) throw fail(400, 'Professionnel introuvable.');
      // Serialize credit availability with bookings; deleting the session releases its credit.
      const commitCredit = await prepareCoachCredit(db, tx, coachId, { ...session, id, status: 'annulée' });
      commitCredit();
      tx.delete(clientRef.collection('calendarEvents').doc(id));
      tx.delete(ref);
      return { deleted: true, id, clientId };
    });
  };
}
module.exports = { createDeleteCoachSession };
