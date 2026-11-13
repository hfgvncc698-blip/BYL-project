import { runTransaction, serverTimestamp } from 'firebase/firestore';
import { dashboardSessionSummary } from './dashboardPrescriptionSummary.js';
import { applySportProgressionToSession } from './trainingEngine.js';

export function dashboardAdjustmentPatch(full, {sessionKey,index,expected,decision,audit}) {
  const sessions=full[sessionKey];
  const current=Array.isArray(sessions) ? sessions[index] : null;
  if(!current || JSON.stringify(dashboardSessionSummary(current))!==JSON.stringify(dashboardSessionSummary(expected))) {
    throw Object.assign(new Error('Le programme a changé. Rechargez-le avant de confirmer.'),{code:'dashboard-program-changed'});
  }
  const adjusted=applySportProgressionToSession(current,decision);
  if(!adjusted.changedCount)throw new Error('Aucun ajustement applicable');
  const next=[...sessions];next[index]=adjusted.session;
  return {[sessionKey]:next,lastRadarAdjustment:audit,lastCopilotAdjustment:audit};
}
export async function writeDashboardAdjustment(db, ref, options, isCurrent) {
  return runTransaction(db,async tx=>{
    if(!isCurrent())throw new Error('Session terminée');
    const snapshot=await tx.get(ref);
    if(!snapshot.exists())throw new Error('Programme introuvable');
    const patch=dashboardAdjustmentPatch(snapshot.data(),options);
    if(!isCurrent())throw new Error('Session terminée');
    tx.update(ref,{...patch,updatedAt:serverTimestamp()});
    return patch[options.sessionKey];
  });
}
