const fail = (status, message) => Object.assign(new Error(message), { status });

function createDeletePersonalSession(db) {
  return async (uid, id) => {
    if (!uid) throw fail(401, 'Connexion requise.');
    if (typeof id !== 'string' || !id || id.includes('/')) throw fail(400, 'Séance invalide.');
    const ref = db.collection('sessions').doc(id);
    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw fail(404, 'Séance introuvable.');
      const session = snapshot.data();
      // A client's own planning is distinct from professional/club appointments.
      const managed = ['coachId', 'coachUid', 'clubId', 'clubAppointmentId'].some(key => !!session[key]) ||
        (session.coachIds?.length > 0) ||
        ['ownerUid', 'createdBy', 'assignedBy'].some(key => session[key] && session[key] !== uid);
      if (managed || ![session.clientId, session.clientUid, session.userId].includes(uid)) {
        throw fail(403, 'Seules vos séances personnelles peuvent être supprimées.');
      }
      transaction.delete(ref);
      return { deleted: true, id };
    });
  };
}
module.exports = { createDeletePersonalSession };
