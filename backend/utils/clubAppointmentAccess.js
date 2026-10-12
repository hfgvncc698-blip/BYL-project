async function assertAssignedGroupCoach(db, uid, clubId, appointmentId, tx) {
  const get = ref => tx ? tx.get(ref) : ref.get();
  const [u,m,a] = await Promise.all([
    get(db.collection('users').doc(uid)),
    get(db.collection('clubs').doc(clubId).collection('members').doc(uid)),
    get(db.collection('clubs').doc(clubId).collection('appointments').doc(appointmentId)),
  ]);
  if (u.data()?.role !== 'coach' || u.data()?.clubId !== clubId || u.data()?.disabledByClub || m.data()?.status !== 'active' || a.data()?.type !== 'group' || a.data()?.coachUid !== uid) {
    throw Object.assign(new Error('Accès refusé.'), {status:403});
  }
}
function canChangeRegistrationMode(assignedGroupCoach, current, requested) {
  return !assignedGroupCoach || requested === undefined || requested === (current || 'inherit');
}
module.exports = {assertAssignedGroupCoach, canChangeRegistrationMode};
