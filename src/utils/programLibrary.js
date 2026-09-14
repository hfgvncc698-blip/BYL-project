export function isClientProgram(program = {}) {
  if (program.libraryKind === 'template') return false;
  return program.libraryKind === 'client' || !!program.cycleDraft || !!program.cyclePreparation;
}

export function programClientName(client = {}) {
  return client.fullName || client.name || client.displayName || [client.prenom || client.firstName, client.nom || client.lastName].filter(Boolean).join(' ') || client.email || '';
}

export function resolvePreparedClient(program, clients) {
  return clients.find(client => client.id === program.preparedForClientId)
    || clients.find(client => client.trainingPlan?.cycles?.some(cycle => cycle.draftProgramId === program.id))
    || null;
}

export const libraryDraftLabels = { fr: 'Brouillon', en: 'Draft', es: 'Borrador', it: 'Bozza', de: 'Entwurf', ru: 'Черновик', ar: 'مسودة' };

export function asReusableTemplate(program) {
  const next = { ...program, libraryKind: 'template', status: 'draft' };
  for (const key of ['cycleDraft', 'cyclePreparation', 'preparedForClientId', 'preparedForClientName', 'preparedForCycleId', 'clientId', 'clientNom', 'assignedTo', 'assignedClients', 'assignedClientIds', 'sessionsEffectuees', 'historique_modifications', 'completedSessions', 'progress', 'notes']) delete next[key];
  const sessions = program.sessions || program.seances;
  if (Array.isArray(sessions)) {
    next.sessions = structuredClone(sessions);
    delete next.seances;
    for (const session of next.sessions) {
      for (const key of ['exercises', 'echauffement', 'corps', 'bonus', 'retourCalme']) {
        for (const exercise of session[key] || []) {
          delete exercise.cyclePrescription;
          delete exercise._historyLoadAuto;
          for (const field of ['Charge (kg)', 'Charge (lbs)', 'Charge', 'chargeKg', 'charge', 'weight', 'poids', 'load']) if (field in exercise) exercise[field] = 0;
          for (const set of exercise.sets || []) if ('chargeKg' in set) set.chargeKg = 0;
          for (const detail of exercise.seriesDetails || []) if ('Charge (kg)' in detail) detail['Charge (kg)'] = 0;
        }
      }
    }
  }
  return next;
}

export const libraryLabels = {
  fr: ['Modèles', 'Programmes clients', 'Tous', 'Enregistrer comme modèle', 'Modèle réutilisable', 'Bibliothèque'],
  en: ['Templates', 'Client programmes', 'All', 'Save as template', 'Reusable template', 'Library'],
  es: ['Plantillas', 'Programas de clientes', 'Todos', 'Guardar como plantilla', 'Plantilla reutilizable', 'Biblioteca'],
  it: ['Modelli', 'Programmi clienti', 'Tutti', 'Salva come modello', 'Modello riutilizzabile', 'Libreria'],
  de: ['Vorlagen', 'Kundenprogramme', 'Alle', 'Als Vorlage speichern', 'Wiederverwendbare Vorlage', 'Bibliothek'],
  ru: ['Шаблоны', 'Программы клиентов', 'Все', 'Сохранить как шаблон', 'Многоразовый шаблон', 'Библиотека'],
  ar: ['القوالب', 'برامج العملاء', 'الكل', 'حفظ كقالب', 'قالب قابل لإعادة الاستخدام', 'المكتبة'],
};
