function canManageNote(user, uid, client) {
  if (!user || !client || !uid) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'coach') return false;
  return [client.createdBy, client.coachId, client.ownerId, ...(Array.isArray(client.coachIds) ? client.coachIds : [])].includes(uid)
    || Boolean(user.clubId && (client.clubId === user.clubId || client.clubIds?.includes(user.clubId)));
}
function createProfessionalClientNotes(db) {
  async function scope(uid, clientId) {
    if (typeof clientId !== 'string' || !clientId || clientId.includes('/') || clientId.length > 180) throw Object.assign(new Error('invalid-client'), {status:400});
    const [user, client] = await Promise.all([db.collection('users').doc(uid).get(), db.collection('clients').doc(clientId).get()]);
    if (!canManageNote(user.data(), uid, client.data())) throw Object.assign(new Error('notes-forbidden'), {status:403});
    // Server-only collection, deliberately outside the client-readable profile.
    return db.collection('professionalClientNotes').doc(uid).collection('clients').doc(clientId);
  }
  return {
    async get(uid, clientId) {
      const ref = await scope(uid, clientId);
      const data = (await ref.get()).data();
      return {text:data?.text || '', version:data?.version || 0};
    },
    async save(uid, clientId, input) {
      if (typeof input?.text !== 'string' || input.text.length > 8000 || !Number.isInteger(input.version) || input.version < 0) throw Object.assign(new Error('invalid-note'), {status:400});
      const ref = await scope(uid, clientId);
      return db.runTransaction(async tx => {
        const old = (await tx.get(ref)).data();
        if ((old?.version || 0) !== input.version) throw Object.assign(new Error('note-conflict'), {status:409});
        const note = {text:input.text, version:input.version + 1, updatedAt:Date.now()};
        tx.set(ref, note);
        return note;
      });
    },
  };
}
module.exports = {canManageNote, createProfessionalClientNotes};
