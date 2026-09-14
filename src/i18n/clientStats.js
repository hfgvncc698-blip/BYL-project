const rows={
fr:['Ton programme, tes séances et tes mesures, au même endroit.','Autres mesures','Courbes à afficher','Masquer les autres mesures','Dernières séances','Voir mes résultats'],
en:['Your programme, sessions and measurements in one place.','Other measurements','Charts to display','Hide other measurements','Latest sessions','View my results'],
es:['Tu programa, sesiones y medidas en un solo lugar.','Otras medidas','Curvas para mostrar','Ocultar otras medidas','Últimas sesiones','Ver mis resultados'],
it:['Programma, sessioni e misure in un unico posto.','Altre misure','Grafici da mostrare','Nascondi altre misure','Ultime sessioni','Vedi i miei risultati'],
de:['Dein Programm, deine Einheiten und Messwerte an einem Ort.','Weitere Messwerte','Diagramme auswählen','Weitere Messwerte ausblenden','Letzte Einheiten','Meine Ergebnisse ansehen'],
ru:['Программа, тренировки и измерения в одном месте.','Другие измерения','Графики для отображения','Скрыть другие измерения','Последние тренировки','Мои результаты'],
ar:['برنامجك وحصصك وقياساتك في مكان واحد.','قياسات أخرى','الرسوم البيانية المعروضة','إخفاء القياسات الأخرى','أحدث الحصص','عرض نتائجي'],
};
export const clientStatsLabels=language=>{
 const row=rows[String(language||'fr').split('-')[0]]||rows.fr;
 return Object.fromEntries(['subtitle','more','chart','less','recent','results'].map((key,index)=>[key,row[index]]));
};
