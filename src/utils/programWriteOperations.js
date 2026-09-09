import { doc, collection, runTransaction, arrayUnion, serverTimestamp } from "firebase/firestore";

export function createProgramAssignmentOperation({ db, clientId, programId, coachId, loadProgram, updateTemplate = false }) {
  const assignedRef = doc(collection(db, "clients", clientId, "programmes"));
  return async () => runTransaction(db, async transaction => {
    const existing = await transaction.get(assignedRef);
    if (existing.exists()) {
      if (existing.data().fromTemplateId !== programId) throw new Error("Conflit de confirmation du programme.");
      return assignedRef.id;
    }
    const program = await loadProgram(transaction);
    transaction.set(assignedRef, {
      ...program,
      id: assignedRef.id,
      programId,
      fromTemplateId: programId,
      templateId: programId,
    });
    transaction.update(doc(db, "clients", clientId), {
      currentProgramme: assignedRef.id,
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
  return async () => runTransaction(db, async transaction => {
    const existing = await transaction.get(programRef);
    if (!existing.exists()) transaction.set(programRef, payload);
    else if (existing.data().createdBy !== payload.createdBy) throw new Error("Conflit de confirmation du programme.");
    return { id: programRef.id, editVersion };
  });
}
