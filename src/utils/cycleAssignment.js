import { inferCycleType } from './trainingCycles.js';

export function recommendedCyclePlacement(client = {}) {
  if (client.sportFollowView === 'programs') return 'separate';
  const open = client.trainingPlan?.cycles?.find(c => !c.closedAt);
  if (open) return open.programId || open.draftProgramId ? 'next' : 'current';
  return client.currentProgramme ? 'next' : 'current';
}

export function cycleAssignmentPatch(client, assignedId, placement, proposedPlan, expectedRevision, program = null) {
  if (placement === 'separate') return {};
  if (!['current', 'next'].includes(placement)) throw new Error('invalid-placement');
  const stored = client.trainingPlan;
  if ((stored?.revision || 0) !== expectedRevision) throw new Error('cycle-conflict');
  const plan = structuredClone(stored?.cycles?.length ? stored : proposedPlan);
  if (!plan?.cycles?.length) throw new Error('cycle-missing');
  let index = plan.cycles.findIndex(c => !c.closedAt);
  if (index < 0) throw new Error('cycle-completed');
  const currentIndex = index;
  const templateIds = [program?.id, program?.programId, program?.fromTemplateId, program?.templateId].filter(Boolean);
  const preparedIndex = plan.cycles.findIndex(c => !c.closedAt && !c.programId && c.draftProgramId && templateIds.includes(c.draftProgramId));
  if (preparedIndex >= 0) index = preparedIndex;
  else if (placement === 'next') {
    index++;
    if (!plan.cycles[index] || plan.cycles[index].closedAt || plan.cycles[index].programId || plan.cycles[index].draftProgramId) throw new Error('next-cycle-unavailable');
  }
  const target = plan.cycles[index];
  plan.cycles[index] = {
    ...target, programId: assignedId,
    ...(program && index === currentIndex ? { type: inferCycleType(program) } : {}),
    ...(preparedIndex >= 0 ? { draftProgramId: '' } : {}),
    ...(target.programId ? { previousProgramIds: [...(target.previousProgramIds || []), target.programId] } : {}),
  };
  return {
    trainingPlan: { ...plan, revision: (stored?.revision || 0) + 1, updatedAt: new Date().toISOString() },
    ...(index === currentIndex ? { currentProgramme: assignedId } : {}),
  };
}

export function cycleAssignmentError(error, language = 'fr') {
  if (!['cycle-conflict', 'cycle-missing', 'cycle-completed', 'next-cycle-unavailable'].includes(error?.message)) return null;
  const messages = {
    fr: 'La programmation a changé ou le cycle choisi n’est pas disponible. Vérifiez la programmation ou choisissez « Ajouter séparément ». Aucun programme n’a été ajouté.',
    en: 'The plan has changed or the selected cycle is unavailable. Check the plan or choose “Add separately”. No programme was added.',
    es: 'El plan ha cambiado o el ciclo seleccionado no está disponible. Revisa el plan o elige «Añadir por separado». No se ha añadido ningún programa.',
    it: 'Il piano è cambiato o il ciclo selezionato non è disponibile. Controlla il piano o scegli «Aggiungi separatamente». Nessun programma è stato aggiunto.',
    de: 'Der Plan hat sich geändert oder der gewählte Zyklus ist nicht verfügbar. Prüfe den Plan oder wähle „Separat hinzufügen“. Es wurde kein Programm hinzugefügt.',
    ru: 'План изменился или выбранный цикл недоступен. Проверьте план или выберите «Добавить отдельно». Программа не добавлена.',
    ar: 'تغيّرت الخطة أو الدورة المحددة غير متاحة. راجع الخطة أو اختر «إضافة بشكل منفصل». لم تتم إضافة أي برنامج.',
  };
  return messages[language.split('-')[0]] || messages.fr;
}
