const rows = {
  fr:['Voir mon parcours','Le prochain programme attend la validation du coach.','Cycle terminé. La suite se synchronise.','Parcours terminé. Retrouvez vos résultats.','Nouveau cycle','Voir mes résultats'],
  en:['View my plan','The next programme is awaiting coach approval.','Cycle complete. The next step is syncing.','Plan complete. View your results.','New cycle','View my results'],
  es:['Ver mi planificación','El próximo programa espera la validación del entrenador.','Ciclo terminado. Se está sincronizando la siguiente etapa.','Planificación terminada. Consulta tus resultados.','Nuevo ciclo','Ver mis resultados'],
  it:['Vedi il mio percorso','Il prossimo programma attende la conferma del coach.','Ciclo completato. La fase successiva si sta sincronizzando.','Percorso completato. Consulta i risultati.','Nuovo ciclo','Vedi i miei risultati'],
  de:['Meinen Plan ansehen','Das nächste Programm wartet auf die Freigabe des Coaches.','Zyklus abgeschlossen. Der nächste Schritt wird synchronisiert.','Plan abgeschlossen. Sieh dir deine Ergebnisse an.','Neuer Zyklus','Meine Ergebnisse ansehen'],
  ru:['Мой план','Следующая программа ожидает подтверждения тренера.','Цикл завершён. Следующий этап синхронизируется.','План завершён. Посмотрите результаты.','Новый цикл','Мои результаты'],
  ar:['عرض خطتي','البرنامج التالي بانتظار موافقة المدرب.','اكتملت الدورة. تتم مزامنة المرحلة التالية.','اكتملت الخطة. اطلع على نتائجك.','دورة جديدة','عرض نتائجي'],
};
export function dashboardCycleLabels(language) {return rows[String(language||'fr').split('-')[0]]||rows.fr;}
