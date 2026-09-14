// Server-side transition: independent of the screen, device and lifecycle emails.
function isValidated(record = {}) {
  const status = String(record.status || '').trim().toLowerCase();
  if (record.isPartial || ['en_cours', 'in_progress', 'partial'].includes(status)) return false;
  return ['validée', 'validee', 'terminée', 'terminee', 'done', 'completed'].includes(status)
    || record.validated === true || record.isValidated === true
    || Boolean(record.completedAt || record.validatedAt || record.dateEffectuee || record.finishedAt || record.playedAt);
}

async function advanceCompletedTrainingCycle(db, clientId, programmeId, countPlanned, now = () => new Date().toISOString()) {
  const clientRef = db.doc(`clients/${clientId}`);
  const programRef = clientRef.collection('programmes').doc(programmeId);
  return db.runTransaction(async transaction => {
    const clientSnap = await transaction.get(clientRef);
    if (!clientSnap.exists) return false;
    const client = clientSnap.data();
    if (client.sportFollowView === 'programs') return false;
    const plan = client.trainingPlan;
    if (!Array.isArray(plan?.cycles)) return false;
    const index = plan.cycles.findIndex(c => !c.closedAt);
    if (index < 0 || plan.cycles[index].programId !== programmeId) return false;
    const programSnap = await transaction.get(programRef);
    if (!programSnap.exists) return false;
    const program = programSnap.data();
    if (program.excludeFromCyclePlanning) return false;
    const total = countPlanned(program);
    if (!Number.isFinite(total) || total <= 0) return false;
    const history = await transaction.get(programRef.collection('sessionsEffectuees'));
    if (history.docs.filter(row => isValidated(row.data())).length < total) return false;
    const successor = plan.cycles.slice(index + 1).find(c => !c.closedAt);
    let currentProgramme = null;
    if (successor?.programId) {
      const next = await transaction.get(clientRef.collection('programmes').doc(successor.programId));
      if (next.exists && next.data().status !== 'draft' && !next.data().excludeFromCyclePlanning) currentProgramme = successor.programId;
    }
    const closedAt = now();
    transaction.update(clientRef, {
      currentProgramme,
      trainingPlan: { ...plan, revision: (plan.revision || 0) + 1, updatedAt: closedAt,
        cycles: plan.cycles.map((cycle, i) => i === index ? { ...cycle, closedAt, completedAutomatically: true } : cycle) },
    });
    if (client.subscriptionCycle?.enabled === true) {
      transaction.set(db.collection('subscription_cycle_jobs').doc(clientId), {
        status:'pending',leaseUntil:0,updatedAt:closedAt,
      }, {merge:true});
    }
    return true;
  });
}

module.exports = { advanceCompletedTrainingCycle, isValidated };
