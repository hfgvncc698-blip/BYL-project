import { doc, collection, runTransaction, arrayUnion, serverTimestamp } from "firebase/firestore";
import { cycleAssignmentPatch, recommendedCyclePlacement } from './cycleAssignment.js';
import { continuingCyclePlan, suggestedCycles, displayedCyclePlan } from './trainingCycles.js';
import {assertProgramSize} from './safeProgramWrite.js';

export function createProgramAssignmentOperation({ db, clientId, programId, coachId, loadProgram, updateTemplate = false, placement }) {
  const assignedRef = doc(collection(db, "clients", clientId, "programmes"));
  return async () => runTransaction(db, async transaction => {
    const existing = await transaction.get(assignedRef);
    if (existing.exists()) {
      if (existing.data().fromTemplateId !== programId) throw new Error("Conflit de confirmation du programme.");
      return assignedRef.id;
    }
    const program = { ...await loadProgram(transaction) };
    // `sessions` is canonical; do not duplicate the full exercise payload.
    if (Array.isArray(program.sessions)) delete program.seances;
    let cyclePatch = { currentProgramme: assignedRef.id };
    if (placement) {
      const clientSnap = await transaction.get(doc(db, 'clients', clientId));
      if (!clientSnap.exists()) throw new Error('client-missing');
      const client = clientSnap.data();
      const choice = placement === 'auto' ? recommendedCyclePlacement(client) : placement;
      const now = new Date();
      const suggestion = { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, revision: 0, cycles: suggestedCycles(() => crypto.randomUUID()) };
      const currentId = typeof client.currentProgramme === 'string' ? client.currentProgramme : client.currentProgramme?.id;
      let current = [];
      if (!client.trainingPlan?.cycles?.length && currentId && choice !== 'separate') {
        const snapshot = await transaction.get(doc(db, 'clients', clientId, 'programmes', currentId));
        if (snapshot.exists()) current = [{ ...snapshot.data(), id: currentId, __detailsLoaded: true, sessionsEffectuees: [], _done: 0 }];
      }
      const proposed = displayedCyclePlan(client.trainingPlan, continuingCyclePlan(client, current, suggestion));
      cyclePatch = cycleAssignmentPatch(client, assignedRef.id, choice, proposed, client.trainingPlan?.revision || 0, { ...program, templateId: programId });
      program.excludeFromCyclePlanning = choice === 'separate';
    }
    const assignment = {
      ...program,
      id: assignedRef.id,
      programId,
      fromTemplateId: programId,
      templateId: programId,
    };
    assertProgramSize(assignment, assignedRef.path);
    transaction.set(assignedRef, assignment);
    transaction.update(doc(db, "clients", clientId), {
      ...cyclePatch,
      programmes: arrayUnion(assignedRef.id),
      coachIds: arrayUnion(coachId),
      lastAssignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (updateTemplate) transaction.update(doc(db, "programmes", programId), {
      assignedTo: clientId,
      assignedAt: serverTimestamp(),
      assignedClients: arrayUnion(clientId),
      assignedClientIds: arrayUnion(clientId),
      lastAssignedAt: serverTimestamp(),
    });
    return assignedRef.id;
  });
}

export function createProgramCreationOperation({ db, payload, editVersion }) {
  const programRef = doc(collection(db, "programmes"));
  assertProgramSize(payload, programRef.path);
  return async () => runTransaction(db, async transaction => {
    const existing = await transaction.get(programRef);
    if (!existing.exists()) transaction.set(programRef, payload);
    else if (existing.data().createdBy !== payload.createdBy) throw new Error("Conflit de confirmation du programme.");
    return { id: programRef.id, editVersion };
  });
}
