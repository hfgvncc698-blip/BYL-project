const DEFAULT_DURATIONS = {
  success: 2800,
  info: 3600,
  warning: 4200,
  error: 5200,
};

export const notificationCopy = {
  dataLoadError: {
    status: "error",
    title: "Chargement impossible",
    description: "Nous n'avons pas pu récupérer les informations. Réessayez dans quelques secondes.",
  },
  saveSuccess: {
    status: "success",
    title: "Modifications enregistrées",
    description: "Tout est bien à jour.",
  },
  saveError: {
    status: "error",
    title: "Enregistrement impossible",
    description: "Vérifiez votre connexion puis réessayez.",
  },
  profileSaved: {
    status: "success",
    title: "Profil mis à jour",
    description: "Vos informations sont bien enregistrées.",
  },
  settingsSaved: {
    status: "success",
    title: "Préférences mises à jour",
    description: "Votre espace est maintenant configuré comme souhaité.",
  },
  resetSent: {
    status: "success",
    title: "E-mail envoyé",
    description: "Vous pouvez maintenant suivre le lien reçu pour sécuriser votre accès.",
  },
  clientCreated: {
    status: "success",
    title: "Client créé",
    description: "Son espace est prêt. Vous pouvez maintenant lui assigner un programme.",
    duration: 4200,
  },
  clientCreatedWithEmail: {
    status: "success",
    title: "Client créé",
    description: "Un e-mail de configuration vient de lui être envoyé.",
    duration: 4600,
  },
  clientLinked: {
    status: "success",
    title: "Client lié",
    description: "Le compte existait déjà. Il est maintenant rattaché à votre espace.",
    duration: 4200,
  },
  clientInviteSent: {
    status: "success",
    title: "Invitation envoyée",
    description: "Le client peut maintenant rejoindre son espace.",
  },
  clientMissingPhone: {
    status: "warning",
    title: "Téléphone manquant",
    description: "Ajoutez un numéro pour envoyer l'invitation par téléphone.",
  },
  programAssigned: {
    status: "success",
    title: "Programme assigné",
    description: "Le client le retrouve maintenant dans son espace.",
  },
  programAssignMissing: {
    status: "warning",
    title: "Programme à sélectionner",
    description: "Choisissez un programme avant de continuer.",
  },
  programAssignError: {
    status: "error",
    title: "Assignation impossible",
    description: "Le programme n'a pas pu être attribué. Réessayez dans quelques secondes.",
  },
  programDuplicated: {
    status: "success",
    title: "Programme dupliqué",
    description: "Une copie est prête à être ajustée.",
  },
  programDeleted: {
    status: "success",
    title: "Programme supprimé",
    description: "La liste des programmes est à jour.",
  },
  programMissing: {
    status: "warning",
    title: "Programme introuvable",
    description: "Vérifiez la sélection ou rechargez la page.",
  },
  sessionPlanned: {
    status: "success",
    title: "Séance planifiée",
    description: "Elle apparaît désormais dans le calendrier.",
  },
  sessionValidated: {
    status: "success",
    title: "Séance validée",
    description: "Bien joué, la progression vient d'être mise à jour.",
    duration: 3800,
  },
  sessionReadonly: {
    status: "info",
    title: "Séance déjà validée",
    description: "Elle reste consultable, mais elle ne peut plus être modifiée ici.",
  },
  sessionDeleteBlocked: {
    status: "info",
    title: "Suppression bloquée",
    description: "Une séance validée doit rester dans l'historique de progression.",
  },
  calendarCopied: {
    status: "success",
    title: "Lien calendrier copié",
    description: "La synchronisation peut prendre quelques minutes selon l'app calendrier.",
    duration: 4200,
  },
  calendarGenerated: {
    status: "success",
    title: "Calendrier prêt",
    description: "Copiez le lien pour l'ajouter à votre calendrier.",
  },
  calendarError: {
    status: "error",
    title: "Calendrier indisponible",
    description: "Impossible de générer le lien pour le moment. Réessayez un peu plus tard.",
  },
  nutritionDraftCreated: {
    status: "success",
    title: "Bilan nutrition créé",
    description: "Les premières informations ont été pré-remplies pour gagner du temps.",
  },
  nutritionSaved: {
    status: "success",
    title: "Nutrition enregistrée",
    description: "Les données sont sauvegardées et prêtes pour la suite.",
  },
  rationSaved: {
    status: "success",
    title: "Ration enregistrée",
    description: "La ration active est à jour.",
  },
  pdfReady: {
    status: "success",
    title: "PDF généré",
    description: "Le document est prêt à être partagé.",
  },
  pdfError: {
    status: "error",
    title: "PDF impossible",
    description: "La génération a échoué. Réessayez après avoir rechargé la page.",
  },
  accessReserved: {
    status: "warning",
    title: "Accès réservé",
    description: "Cette partie est encore limitée aux administrateurs.",
  },
};

export function notify(toast, key, overrides = {}) {
  const base = notificationCopy[key] || {};
  const status = overrides.status || base.status || "info";

  toast({
    status,
    variant: "toast",
    title: overrides.title ?? base.title,
    description: overrides.description ?? base.description,
    duration: overrides.duration ?? base.duration ?? DEFAULT_DURATIONS[status] ?? 3600,
    isClosable: overrides.isClosable ?? true,
    ...overrides,
  });
}
