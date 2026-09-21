const messages = {
  fr: 'Programme trop volumineux. Répartissez les séances dans plusieurs programmes avant d’enregistrer. Aucune donnée n’a été écrasée.',
  en: 'This programme is too large. Split its sessions into several programmes before saving. No data has been overwritten.',
  es: 'El programa es demasiado grande. Divide las sesiones entre varios programas antes de guardar. No se ha sobrescrito ningún dato.',
  it: 'Il programma è troppo grande. Distribuisci le sessioni in più programmi prima di salvare. Nessun dato è stato sovrascritto.',
  de: 'Dieses Programm ist zu groß. Teile die Einheiten vor dem Speichern auf mehrere Programme auf. Es wurden keine Daten überschrieben.',
  ru: 'Программа слишком большая. Разделите тренировки на несколько программ перед сохранением. Данные не были перезаписаны.',
  ar: 'هذا البرنامج كبير جدًا. وزّع الحصص على عدة برامج قبل الحفظ. لم تتم الكتابة فوق أي بيانات.',
};
export const programSizeMessage = language => messages[String(language || 'fr').split('-')[0]] || messages.fr;
