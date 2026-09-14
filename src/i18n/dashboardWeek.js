const rows={
  fr:['Semaine précédente','Semaine suivante','Cette semaine','Aucune séance cette semaine.'],
  en:['Previous week','Next week','This week','No sessions this week.'],
  es:['Semana anterior','Semana siguiente','Esta semana','No hay sesiones esta semana.'],
  it:['Settimana precedente','Settimana successiva','Questa settimana','Nessuna sessione questa settimana.'],
  de:['Vorherige Woche','Nächste Woche','Diese Woche','Keine Einheiten in dieser Woche.'],
  ru:['Предыдущая неделя','Следующая неделя','Эта неделя','На этой неделе нет занятий.'],
  ar:['الأسبوع السابق','الأسبوع التالي','هذا الأسبوع','لا توجد جلسات هذا الأسبوع.'],
};
export function dashboardWeekLabels(language){return rows[String(language||'fr').split('-')[0]]||rows.fr;}
