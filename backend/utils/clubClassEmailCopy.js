// Calendar notification copy kept inside the standalone backend deployment.
function sessionEmailCopy(change, lng = 'fr', timezone = 'Europe/Paris') {
  const locale = ['fr', 'en', 'es', 'de', 'it', 'ru', 'ar'].includes(lng) ? lng : 'fr';
  const words = {
    fr: ['Rendez-vous confirmé', 'Rendez-vous modifié', 'Rendez-vous annulé', 'Votre calendrier BoostYourLife a été mis à jour.', 'Voir mon calendrier'],
    en: ['Appointment confirmed', 'Appointment updated', 'Appointment cancelled', 'Your BoostYourLife calendar has been updated.', 'View my calendar'],
    es: ['Cita confirmada', 'Cita modificada', 'Cita cancelada', 'Tu calendario BoostYourLife se ha actualizado.', 'Ver mi calendario'],
    de: ['Termin bestätigt', 'Termin geändert', 'Termin abgesagt', 'Dein BoostYourLife-Kalender wurde aktualisiert.', 'Meinen Kalender öffnen'],
    it: ['Appuntamento confermato', 'Appuntamento modificato', 'Appuntamento annullato', 'Il tuo calendario BoostYourLife è stato aggiornato.', 'Apri il calendario'],
    ru: ['Запись подтверждена', 'Запись изменена', 'Запись отменена', 'Ваш календарь BoostYourLife обновлён.', 'Открыть календарь'],
    ar: ['تم تأكيد الموعد', 'تم تعديل الموعد', 'تم إلغاء الموعد', 'تم تحديث تقويم BoostYourLife الخاص بك.', 'عرض التقويم'],
  }[locale];
  let zone = timezone;
  try { new Intl.DateTimeFormat(locale, { timeZone: zone }).format(new Date()); } catch { zone = 'Europe/Paris'; }
  const detail = `${new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: zone }).format(new Date(change.start))} — ${new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: zone }).format(new Date(change.end))} (${zone})`;
  const title = words[{ created: 0, updated: 1, cancelled: 2 }[change.kind]];
  return { subject: title, title, intro: words[3], cta: words[4], detail, lng: locale };
}

module.exports = { sessionEmailCopy };
