import { doc, collection, runTransaction, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { cycleAssignmentPatch } from './cycleAssignment.js';
import {assertProgramSize} from './safeProgramWrite.js';

export async function confirmCycleDraft(transaction, { templateRef, clientRef, assignedRef, assignedRefForId, payload, expectedRevision }) {
  const templateSnap = await transaction.get(templateRef);
  if (!templateSnap.exists()) throw new Error('cycle-draft-missing');
  const template = templateSnap.data();
  if (template.preparedForClientId !== clientRef.id) throw new Error('cycle-client-mismatch');
  // A second click/device returns the original assignment, never duplicates it.
  if (template.validatedCycleAssignmentId) {
    const existing = await transaction.get(assignedRefForId(template.validatedCycleAssignmentId));
    if (!existing.exists()) throw new Error('cycle-assignment-missing');
    return existing.id;
  }
  if ((template._rev || 0) !== expectedRevision) throw new Error('cycle-draft-conflict');
  const clientSnap = await transaction.get(clientRef);
  if (!clientSnap.exists()) throw new Error('client-missing');
  const client = clientSnap.data();
  const target = client.trainingPlan?.cycles?.find(c => c.id === template.preparedForCycleId);
  if (!target || target.closedAt || target.programId || target.draftProgramId !== templateRef.id) throw new Error('cycle-target-changed');
  if (!payload.sessions?.length) throw new Error('empty-program');
  const program = { ...template, ...payload, status: 'active', libraryKind: 'client', templateId: templateRef.id, fromTemplateId: templateRef.id, programId: templateRef.id };
  delete program.seances;
  const patch = cycleAssignmentPatch(client, assignedRef.id, 'next', client.trainingPlan, client.trainingPlan.revision || 0, program);
  // Duration shown in the timeline matches the programme being validated.
  patch.trainingPlan.cycles = patch.trainingPlan.cycles.map(c => c.id === target.id ? { ...c, weeks: payload.activeWeeks } : c);
  const assignment = { ...program, id: assignedRef.id, clientId: clientRef.id, excludeFromCyclePlanning: false, assignedAt: serverTimestamp(), createdAt: serverTimestamp() };
  assertProgramSize(assignment, assignedRef.path);
  assertProgramSize({...template, ...payload, validatedCycleAssignmentId: assignedRef.id}, templateRef.path);
  transaction.set(assignedRef, assignment);
  transaction.update(templateRef, { ...payload, validatedCycleAssignmentId: assignedRef.id, updatedAt: serverTimestamp() });
  transaction.update(clientRef, { ...patch, programmes: arrayUnion(assignedRef.id), updatedAt: serverTimestamp() });
  return assignedRef.id;
}

export function createCycleValidationOperation({ db, programId, clientId, payload, expectedRevision }) {
  const clientRef = doc(db, 'clients', clientId);
  const assignedRef = doc(collection(clientRef, 'programmes'));
  const templateRef = doc(db, 'programmes', programId);
  return () => runTransaction(db, transaction => confirmCycleDraft(transaction, {
    templateRef, clientRef, assignedRef, assignedRefForId: id => doc(clientRef, 'programmes', id), payload, expectedRevision,
  }));
}

export const cycleValidationLabels = {
  fr: ['Valider pour ce client', 'Enregistrer le brouillon', 'Programme validé et assigné', 'Validation impossible. Vérifiez la connexion ou rechargez le programme si la programmation a changé.'],
  en: ['Validate for this client', 'Save draft', 'Programme validated and assigned', 'Could not validate. Check the connection or reload if the plan has changed.'],
  es: ['Validar para este cliente', 'Guardar borrador', 'Programa validado y asignado', 'No se pudo validar. Comprueba la conexión o recarga si el plan ha cambiado.'],
  it: ['Conferma per questo cliente', 'Salva bozza', 'Programma confermato e assegnato', 'Conferma non riuscita. Verifica la connessione o ricarica se il piano è cambiato.'],
  de: ['Für diesen Kunden bestätigen', 'Entwurf speichern', 'Programm bestätigt und zugewiesen', 'Bestätigung fehlgeschlagen. Verbindung prüfen oder bei geändertem Plan neu laden.'],
  ru: ['Подтвердить для клиента', 'Сохранить черновик', 'Программа подтверждена и назначена', 'Не удалось подтвердить. Проверьте соединение или обновите страницу, если план изменился.'],
  ar: ['اعتماد لهذا العميل', 'حفظ المسودة', 'تم اعتماد البرنامج وإسناده', 'تعذر الاعتماد. تحقق من الاتصال أو أعد التحميل إذا تغيّرت الخطة.'],
};
