// Loaded with the coach-only cycle panel, not with the initial application bundle.
const comparisonLabels = {
  fr: ['Écart par rapport au', 'rép.'],
  en: ['Change since', 'reps'],
  es: ['Cambio respecto al', 'rep.'],
  it: ['Variazione rispetto al', 'rip.'],
  de: ['Änderung gegenüber dem', 'Wdh.'],
  ru: ['Изменение по сравнению с', 'повт.'],
  ar: ['التغير مقارنة بتاريخ', 'تكرار'],
};
const keys = 'add|cancel|close|conflict|done|draftNotice|earlier|edit|empty|error|finished|history|historyLoading|historyNotice|linked|noHistory|notes|openDraft|orientation|planned|plannedSessions|prepare|program|rating|remove|save|saved|session|sourceRequired|start|subtitle|suggest|timeline|title|view|week|weeks|hypertrophy|general|strength|recovery|custom'.split('|');
const texts = {
  en: 'Add cycle|Cancel|Close cycle|This plan changed on another device. Cancel your edits and try again.|Completed|The draft copies exercises from this or the preceding programme. Review loads and goals in the builder before assigning it.|Move earlier|Plan cycles|Plan the next steps. No programme or appointment will be assigned automatically.|Could not save. Check your connection, durations and that each programme belongs to only one cycle.|All programme sessions are complete. Close this cycle and prepare the next one.|Recorded programme history|Loading history…|Only recorded session data is shown. The current programme may have changed.|Programme linked|No completed sessions recorded.|Coach notes|Open draft|Focus|To prepare|Planned sessions · typical week|Prepare in builder|Assigned programme|Difficulty|Remove|Save|Plan saved|Session|First link a programme to the preceding cycle to reuse its exercises.|Macrocycle start|Macrocycle · cycles · weeks · sessions|Suggest 6 months: hypertrophy, recovery, strength|Cycle timeline|Training plan|View programme|Week|Weeks|Hypertrophy|General preparation|Strength|Recovery|Custom',
  es: 'Añadir ciclo|Cancelar|Cerrar ciclo|El plan cambió en otro dispositivo. Cancela tus cambios e inténtalo de nuevo.|Terminado|El borrador copia los ejercicios del programa asociado o anterior. Revisa las cargas y el objetivo en el editor antes de asignarlo.|Adelantar|Planificar ciclos|Planifica los próximos pasos. No se asignarán programas ni citas automáticamente.|No se pudo guardar. Comprueba la conexión, las duraciones y que cada programa esté asociado a un solo ciclo.|Todas las sesiones están terminadas. Cierra este ciclo y prepara el siguiente.|Historial registrado del programa|Cargando historial…|Solo se muestran datos registrados. El programa actual puede haber cambiado.|Programa asociado|No hay sesiones realizadas registradas.|Notas del entrenador|Abrir borrador|Orientación|Por preparar|Sesiones previstas · semana tipo|Preparar en el editor|Programa asignado|Dificultad|Quitar|Guardar|Plan guardado|Sesión|Asocia primero un programa al ciclo anterior para reutilizar sus ejercicios.|Inicio del macrociclo|Macrociclo · ciclos · semanas · sesiones|Proponer 6 meses: hipertrofia, recuperación, fuerza|Cronología de ciclos|Planificación deportiva|Ver programa|Semana|Semanas|Hipertrofia|Preparación general|Fuerza|Recuperación|Personalizada',
  it: 'Aggiungi ciclo|Annulla|Concludi ciclo|Il piano è cambiato su un altro dispositivo. Annulla le modifiche e riprova.|Completato|La bozza copia gli esercizi del programma associato o precedente. Verifica carichi e obiettivo nel builder prima di assegnarla.|Anticipa|Pianifica cicli|Pianifica le prossime tappe. Nessun programma o appuntamento sarà assegnato automaticamente.|Salvataggio non riuscito. Controlla connessione, durate e che ogni programma sia associato a un solo ciclo.|Tutte le sessioni sono completate. Concludi questo ciclo e prepara il prossimo.|Storico registrato del programma|Caricamento dello storico…|Sono mostrati solo i dati registrati. Il programma attuale potrebbe essere cambiato.|Programma associato|Nessuna sessione completata registrata.|Note del coach|Apri bozza|Orientamento|Da preparare|Sessioni previste · settimana tipo|Prepara nel builder|Programma assegnato|Difficoltà|Rimuovi|Salva|Piano salvato|Sessione|Associa prima un programma al ciclo precedente per riutilizzarne gli esercizi.|Inizio macrociclo|Macrociclo · cicli · settimane · sessioni|Proponi 6 mesi: ipertrofia, recupero, forza|Cronologia dei cicli|Pianificazione sportiva|Vedi programma|Settimana|Settimane|Ipertrofia|Preparazione generale|Forza|Recupero|Personalizzata',
  de: 'Zyklus hinzufügen|Abbrechen|Zyklus abschließen|Der Plan wurde auf einem anderen Gerät geändert. Änderungen verwerfen und erneut versuchen.|Abgeschlossen|Der Entwurf übernimmt Übungen aus diesem oder dem vorherigen Programm. Lasten und Ziel vor der Zuweisung im Builder prüfen.|Vorziehen|Zyklen planen|Nächste Schritte planen. Programme und Termine werden nicht automatisch zugewiesen.|Speichern fehlgeschlagen. Verbindung, Dauer und eindeutige Programmzuordnung prüfen.|Alle Einheiten sind abgeschlossen. Diesen Zyklus abschließen und den nächsten vorbereiten.|Gespeicherter Programmverlauf|Verlauf wird geladen…|Nur gespeicherte Trainingsdaten werden angezeigt. Das aktuelle Programm kann geändert worden sein.|Programm verknüpft|Keine abgeschlossenen Einheiten gespeichert.|Trainernotizen|Entwurf öffnen|Schwerpunkt|Vorzubereiten|Geplante Einheiten · Musterwoche|Im Builder vorbereiten|Zugewiesenes Programm|Schwierigkeit|Entfernen|Speichern|Plan gespeichert|Einheit|Zuerst ein Programm mit dem vorherigen Zyklus verknüpfen, um dessen Übungen zu übernehmen.|Beginn des Makrozyklus|Makrozyklus · Zyklen · Wochen · Einheiten|6 Monate vorschlagen: Hypertrophie, Erholung, Kraft|Zyklus-Zeitachse|Trainingsplanung|Programm ansehen|Woche|Wochen|Hypertrophie|Allgemeine Vorbereitung|Kraft|Erholung|Individuell',
  ru: 'Добавить цикл|Отмена|Завершить цикл|План изменён на другом устройстве. Отмените изменения и повторите попытку.|Завершён|Черновик копирует упражнения связанной или предыдущей программы. Проверьте нагрузки и цель в конструкторе перед назначением.|Переместить раньше|Планировать циклы|Планируйте следующие этапы. Программы и встречи не назначаются автоматически.|Не удалось сохранить. Проверьте соединение, длительность и уникальность привязки программ к циклам.|Все тренировки завершены. Завершите цикл и подготовьте следующий.|Сохранённая история программы|Загрузка истории…|Показаны только сохранённые данные тренировок. Текущая программа могла измениться.|Программа связана|Нет записей о завершённых тренировках.|Заметки тренера|Открыть черновик|Направление|К подготовке|План тренировок · типовая неделя|Подготовить в конструкторе|Назначенная программа|Сложность|Убрать|Сохранить|План сохранён|Тренировка|Сначала свяжите программу с предыдущим циклом, чтобы использовать её упражнения.|Начало макроцикла|Макроцикл · циклы · недели · тренировки|Предложить 6 месяцев: гипертрофия, восстановление, сила|Шкала циклов|План тренировок|Открыть программу|Неделя|Недели|Гипертрофия|Общая подготовка|Сила|Восстановление|Индивидуальный',
  ar: 'إضافة دورة|إلغاء|إنهاء الدورة|تم تعديل الخطة على جهاز آخر. ألغِ تعديلاتك ثم حاول مجددًا.|مكتملة|تنسخ المسودة تمارين البرنامج المرتبط أو السابق. راجع الأوزان والهدف في المحرر قبل إسنادها.|تقديم|تخطيط الدورات|خطط للمراحل التالية. لن يتم إسناد برامج أو مواعيد تلقائيًا.|تعذر الحفظ. تحقق من الاتصال والمدد وربط كل برنامج بدورة واحدة فقط.|اكتملت جميع الحصص. يمكنك إنهاء هذه الدورة وتحضير التالية.|سجل البرنامج المحفوظ|جارٍ تحميل السجل…|تُعرض البيانات المسجلة فقط. قد يكون البرنامج الحالي قد تغير.|برنامج مرتبط|لا توجد حصص مكتملة مسجلة.|ملاحظات المدرب|فتح المسودة|الهدف|للتحضير|الحصص المخططة · أسبوع نموذجي|التحضير في المحرر|البرنامج المسند|الصعوبة|إزالة|حفظ|تم حفظ الخطة|حصة|اربط برنامجًا بالدورة السابقة أولًا لإعادة استخدام تمارينه.|بداية الدورة الكبرى|دورة كبرى · دورات · أسابيع · حصص|اقتراح 6 أشهر: تضخم عضلي، تعافٍ، قوة|الخط الزمني للدورات|التخطيط الرياضي|عرض البرنامج|الأسبوع|أسابيع|تضخم عضلي|إعداد عام|قوة|تعافٍ|مخصصة',
};
export const cycleTranslations = Object.fromEntries(Object.entries(texts).map(([language, text]) => [language, Object.fromEntries(keys.map((key, index) => [key, text.split('|')[index]]))]));
const identicalSetLabels = { fr: 'séries identiques', en: 'identical sets', es: 'series idénticas', it: 'serie identiche', de: 'gleiche Sätze', ru: 'одинаковых подхода', ar: 'مجموعات متطابقة' };
for (const [language, [changeSince, repsShort]] of Object.entries(comparisonLabels)) {
  cycleTranslations[language] = { ...cycleTranslations[language], changeSince, repsShort, identicalSets: identicalSetLabels[language] };
}

const editorLabels = {
  "en": {
    "editorHelp": "Select a cycle in the timeline, then edit it below. Changes apply only after saving.",
    "planStart": "Plan start",
    "cycleNumber": "Cycle",
    "cycleKind": "Cycle type",
    "cycleDuration": "Cycle duration",
    "cycleProgram": "Programme to use",
    "programLater": "Prepare later",
    "programHelp": "Choose a programme already assigned to this client, or leave the cycle for later. Changing the cycle type does not change programme exercises.",
    "cycleOptions": "Notes and cycle order",
    "moveEarlier": "Move before the previous cycle",
    "removeCycle": "Remove this cycle",
    "kindHelp_general": "A preparation phase before more specific cycles.",
    "kindHelp_endurance": "Build the ability to sustain and repeat muscular effort.",
    "kindHelp_hypertrophy": "A cycle focused on muscle development.",
    "kindHelp_strength": "A cycle focused on strength development.",
    "kindHelp_recovery": "A lighter phase between training cycles.",
    "kindHelp_custom": "An approach freely defined by the coach."
  },
  "es": {
    "editorHelp": "Selecciona un ciclo en la línea de tiempo y edítalo abajo. Los cambios se aplican al guardar.",
    "planStart": "Inicio de la planificación",
    "cycleNumber": "Ciclo",
    "cycleKind": "Tipo de ciclo",
    "cycleDuration": "Duración del ciclo",
    "cycleProgram": "Programa a utilizar",
    "programLater": "Preparar más adelante",
    "programHelp": "Elige un programa ya asignado al cliente o deja el ciclo para más adelante. Cambiar el tipo de ciclo no modifica los ejercicios.",
    "cycleOptions": "Notas y orden del ciclo",
    "moveEarlier": "Mover antes del ciclo anterior",
    "removeCycle": "Retirar este ciclo",
    "kindHelp_general": "Una fase de preparación antes de ciclos más específicos.",
    "kindHelp_endurance": "Desarrollar la capacidad de mantener y repetir un esfuerzo muscular.",
    "kindHelp_hypertrophy": "Un ciclo orientado al desarrollo muscular.",
    "kindHelp_strength": "Un ciclo orientado al desarrollo de la fuerza.",
    "kindHelp_recovery": "Una fase más ligera entre ciclos de entrenamiento.",
    "kindHelp_custom": "Una orientación definida libremente por el entrenador."
  },
  "it": {
    "editorHelp": "Seleziona un ciclo nella sequenza e modificalo qui sotto. Le modifiche si applicano solo dopo il salvataggio.",
    "planStart": "Inizio della pianificazione",
    "cycleNumber": "Ciclo",
    "cycleKind": "Tipo di ciclo",
    "cycleDuration": "Durata del ciclo",
    "cycleProgram": "Programma da utilizzare",
    "programLater": "Preparare più avanti",
    "programHelp": "Scegli un programma già assegnato al cliente o prepara il ciclo più avanti. Il tipo di ciclo non modifica gli esercizi.",
    "cycleOptions": "Note e ordine del ciclo",
    "moveEarlier": "Sposta prima del ciclo precedente",
    "removeCycle": "Rimuovi questo ciclo",
    "kindHelp_general": "Una fase di preparazione prima dei cicli più specifici.",
    "kindHelp_endurance": "Sviluppare la capacità di sostenere e ripetere uno sforzo muscolare.",
    "kindHelp_hypertrophy": "Un ciclo dedicato allo sviluppo muscolare.",
    "kindHelp_strength": "Un ciclo dedicato allo sviluppo della forza.",
    "kindHelp_recovery": "Una fase più leggera tra i cicli di allenamento.",
    "kindHelp_custom": "Un orientamento definito liberamente dal coach."
  },
  "de": {
    "editorHelp": "Wähle einen Zyklus in der Zeitleiste und bearbeite ihn unten. Änderungen gelten erst nach dem Speichern.",
    "planStart": "Beginn der Planung",
    "cycleNumber": "Zyklus",
    "cycleKind": "Zyklustyp",
    "cycleDuration": "Zyklusdauer",
    "cycleProgram": "Verwendetes Programm",
    "programLater": "Später vorbereiten",
    "programHelp": "Wähle ein bereits zugewiesenes Programm oder bereite den Zyklus später vor. Der Zyklustyp ändert die Übungen nicht.",
    "cycleOptions": "Notizen und Reihenfolge",
    "moveEarlier": "Vor den vorherigen Zyklus verschieben",
    "removeCycle": "Diesen Zyklus entfernen",
    "kindHelp_general": "Eine Vorbereitungsphase vor spezifischeren Zyklen.",
    "kindHelp_endurance": "Die Fähigkeit entwickeln, muskuläre Belastungen aufrechtzuerhalten und zu wiederholen.",
    "kindHelp_hypertrophy": "Ein Zyklus für den Muskelaufbau.",
    "kindHelp_strength": "Ein Zyklus zur Kraftentwicklung.",
    "kindHelp_recovery": "Eine leichtere Phase zwischen Trainingszyklen.",
    "kindHelp_custom": "Eine vom Coach frei definierte Ausrichtung."
  },
  "ru": {
    "editorHelp": "Выберите цикл на шкале и измените его ниже. Изменения применяются только после сохранения.",
    "planStart": "Начало плана",
    "cycleNumber": "Цикл",
    "cycleKind": "Тип цикла",
    "cycleDuration": "Длительность цикла",
    "cycleProgram": "Программа для цикла",
    "programLater": "Подготовить позже",
    "programHelp": "Выберите уже назначенную клиенту программу или подготовьте цикл позже. Тип цикла не изменяет упражнения программы.",
    "cycleOptions": "Заметки и порядок циклов",
    "moveEarlier": "Переместить перед предыдущим циклом",
    "removeCycle": "Удалить этот цикл",
    "kindHelp_general": "Подготовительный этап перед более специализированными циклами.",
    "kindHelp_endurance": "Развитие способности поддерживать и повторять мышечное усилие.",
    "kindHelp_hypertrophy": "Цикл для развития мышц.",
    "kindHelp_strength": "Цикл для развития силы.",
    "kindHelp_recovery": "Более лёгкий этап между тренировочными циклами.",
    "kindHelp_custom": "Направление, свободно определяемое тренером."
  },
  "ar": {
    "editorHelp": "اختر دورة من المخطط ثم عدّلها أدناه. لا تُطبّق التغييرات إلا بعد الحفظ.",
    "planStart": "بداية الخطة",
    "cycleNumber": "الدورة",
    "cycleKind": "نوع الدورة",
    "cycleDuration": "مدة الدورة",
    "cycleProgram": "البرنامج المستخدم",
    "programLater": "التحضير لاحقًا",
    "programHelp": "اختر برنامجًا مسندًا بالفعل للعميل أو اترك الدورة للتحضير لاحقًا. تغيير نوع الدورة لا يغيّر تمارين البرنامج.",
    "cycleOptions": "ملاحظات وترتيب الدورة",
    "moveEarlier": "النقل قبل الدورة السابقة",
    "removeCycle": "إزالة هذه الدورة",
    "kindHelp_general": "مرحلة تحضيرية قبل الدورات الأكثر تخصصًا.",
    "kindHelp_endurance": "تطوير القدرة على الحفاظ على الجهد العضلي وتكراره.",
    "kindHelp_hypertrophy": "دورة تركز على تنمية العضلات.",
    "kindHelp_strength": "دورة تركز على تطوير القوة.",
    "kindHelp_recovery": "مرحلة أخف بين دورات التدريب.",
    "kindHelp_custom": "اتجاه يحدده المدرب بحرية."
  }
};
for (const [language, labels] of Object.entries(editorLabels)) Object.assign(cycleTranslations[language], labels);

const planActionLabels = {"fr":["Actions du cycle","Annuler les modifications","Enregistrer la programmation"],"en":["Cycle actions","Discard changes","Save the plan"],"es":["Acciones del ciclo","Descartar cambios","Guardar la planificación"],"it":["Azioni del ciclo","Annulla le modifiche","Salva la pianificazione"],"de":["Zyklusaktionen","Änderungen verwerfen","Planung speichern"],"ru":["Действия с циклом","Отменить изменения","Сохранить план"],"ar":["إجراءات الدورة","إلغاء التغييرات","حفظ الخطة"]};
for (const [language, [cycleActions, discardPlanEdits, savePlanEdits]] of Object.entries(planActionLabels)) {
  Object.assign(cycleTranslations[language], { cycleActions, discardPlanEdits, savePlanEdits });
}

const cycleDragLabels = {"fr":["Glissez les cycles pour changer leur ordre. Sur mobile, maintenez un cycle puis déplacez-le.","Appuyez sur Espace pour saisir un cycle, utilisez les flèches pour le déplacer, puis Espace pour le déposer. Échap pour annuler.","Aucun programme déjà assigné à ce client n’est disponible pour ce cycle. Assignez-lui un autre programme pour le choisir ici, sans changer son programme actif."],"en":["Drag cycles to change their order. On mobile, press and hold a cycle, then move it.","Press Space to pick up a cycle, use the arrow keys to move it, then Space to drop it. Escape cancels.","No programme already assigned to this client is available for this cycle. Assign another programme to select it here, without changing the active programme."],"es":["Arrastra los ciclos para cambiar su orden. En el móvil, mantén pulsado un ciclo y muévelo.","Pulsa Espacio para tomar un ciclo, usa las flechas para moverlo y Espacio para soltarlo. Escape cancela.","Ningún programa ya asignado a este cliente está disponible para este ciclo. Asígnale otro para seleccionarlo aquí, sin cambiar su programa activo."],"it":["Trascina i cicli per cambiarne l’ordine. Su mobile, tieni premuto un ciclo e spostalo.","Premi Spazio per selezionare un ciclo, usa le frecce per spostarlo e Spazio per rilasciarlo. Esc annulla.","Nessun programma già assegnato a questo cliente è disponibile per questo ciclo. Assegnane un altro per selezionarlo qui, senza cambiare il programma attivo."],"de":["Ziehe die Zyklen in die gewünschte Reihenfolge. Auf dem Handy einen Zyklus gedrückt halten und verschieben.","Leertaste zum Aufnehmen, Pfeiltasten zum Verschieben, Leertaste zum Ablegen. Escape bricht ab.","Kein diesem Kunden bereits zugewiesenes Programm ist für diesen Zyklus verfügbar. Weise ein weiteres zu, um es hier auszuwählen, ohne das aktive Programm zu ändern."],"ru":["Перетаскивайте циклы, чтобы изменить порядок. На телефоне нажмите и удерживайте цикл, затем переместите его.","Нажмите Пробел, чтобы захватить цикл, перемещайте стрелками и нажмите Пробел, чтобы отпустить. Escape отменяет действие.","Для этого цикла нет доступной программы среди уже назначенных клиенту. Назначьте другую, чтобы выбрать её здесь, не меняя активную программу."],"ar":["اسحب الدورات لتغيير ترتيبها. على الهاتف، اضغط مطولًا على الدورة ثم حرّكها.","اضغط مسافة لالتقاط دورة، واستخدم الأسهم لتحريكها، ثم مسافة لإفلاتها. اضغط Escape للإلغاء.","لا يتوفر لهذه الدورة برنامج من البرامج المسندة بالفعل لهذا العميل. أسند إليه برنامجًا آخر لاختياره هنا دون تغيير برنامجه النشط."]};
for (const [language, [dragCycles, dragKeyboard, noProgramChoice]] of Object.entries(cycleDragLabels)) {
  Object.assign(cycleTranslations[language], { dragCycles, dragKeyboard, noProgramChoice });
}

const programHistoryLabels = {"fr":["Programme précédent","Programme disponible"],"en":["Previous programme","Available programme"],"es":["Programa anterior","Programa disponible"],"it":["Programma precedente","Programma disponibile"],"de":["Früheres Programm","Verfügbares Programm"],"ru":["Предыдущая программа","Доступная программа"],"ar":["برنامج سابق","برنامج متاح"]};
for (const [language, [pastProgram, availableProgram]] of Object.entries(programHistoryLabels)) {
  Object.assign(cycleTranslations[language], { pastProgram, availableProgram });
}

const viewSessionLabels = {fr:'Voir',en:'View',es:'Ver',it:'Vedi',de:'Ansehen',ru:'Посмотреть',ar:'عرض'};
for (const [language, viewSession] of Object.entries(viewSessionLabels)) Object.assign(cycleTranslations[language], {viewSession});

const proposalLabels = {
  en: ['Edit plan', 'Here is the suggested six-month plan. The coach can change it or choose not to follow it. No programme is assigned automatically.'],
  es: ['Modificar planificación', 'Esta es la propuesta para seis meses. El entrenador puede modificarla o no seguirla. No se asigna ningún programa automáticamente.'],
  it: ['Modifica pianificazione', 'Ecco la proposta per sei mesi. Il coach può modificarla o scegliere di non seguirla. Nessun programma viene assegnato automaticamente.'],
  de: ['Plan bearbeiten', 'Dies ist der vorgeschlagene Sechsmonatsplan. Der Coach kann ihn ändern oder nicht befolgen. Es wird kein Programm automatisch zugewiesen.'],
  ru: ['Изменить план', 'Это предложенный план на шесть месяцев. Тренер может изменить его или не следовать ему. Программы не назначаются автоматически.'],
  ar: ['تعديل الخطة', 'هذه هي الخطة المقترحة لستة أشهر. يمكن للمدرب تعديلها أو اختيار عدم اتباعها. لا يتم إسناد أي برنامج تلقائيًا.'],
};
for (const [language, [customize, suggestedNotice]] of Object.entries(proposalLabels)) {
  Object.assign(cycleTranslations[language], { customize, suggestedNotice });
}

const guidedKeys = ['chooseStep', 'playStep', 'nextStep', 'realProgress', 'chooseHelp', 'useProgram', 'findProgram', 'reusePrevious', 'details'];
const guided = {
  en: ['Choose a programme', 'Complete the sessions', 'Move to the next cycle', 'Each validated session advances this cycle. Partial sessions do not count as completed.', 'To start, choose a programme already assigned to this client. It will not be duplicated or changed.', 'Use this programme', 'Choose or create a programme', 'Prepare from the previous cycle', 'View weeks and session details'],
  es: ['Elegir un programa', 'Completar las sesiones', 'Pasar al siguiente ciclo', 'Cada sesión validada hace avanzar este ciclo. Las sesiones parciales no cuentan como terminadas.', 'Para empezar, elige un programa ya asignado a este cliente. No se duplicará ni modificará.', 'Usar este programa', 'Elegir o crear un programa', 'Preparar a partir del ciclo anterior', 'Ver semanas y detalles de las sesiones'],
  it: ['Scegli un programma', 'Completa le sessioni', 'Passa al ciclo successivo', 'Ogni sessione convalidata fa avanzare il ciclo. Le sessioni parziali non contano come completate.', 'Per iniziare, scegli un programma già assegnato a questo cliente. Non verrà duplicato né modificato.', 'Usa questo programma', 'Scegli o crea un programma', 'Prepara dal ciclo precedente', 'Vedi settimane e dettagli delle sessioni'],
  de: ['Programm wählen', 'Einheiten absolvieren', 'Zum nächsten Zyklus', 'Jede bestätigte Einheit bringt diesen Zyklus voran. Teileinheiten zählen nicht als abgeschlossen.', 'Wähle zunächst ein diesem Kunden bereits zugewiesenes Programm. Es wird weder kopiert noch verändert.', 'Dieses Programm verwenden', 'Programm wählen oder erstellen', 'Aus dem vorherigen Zyklus vorbereiten', 'Wochen und Trainingsdetails ansehen'],
  ru: ['Выбрать программу', 'Выполнить тренировки', 'Перейти к следующему циклу', 'Каждая подтверждённая тренировка продвигает цикл. Частичные тренировки не считаются завершёнными.', 'Для начала выберите программу, уже назначенную клиенту. Она не будет скопирована или изменена.', 'Использовать эту программу', 'Выбрать или создать программу', 'Подготовить на основе предыдущего цикла', 'Посмотреть недели и детали тренировок'],
  ar: ['اختيار برنامج', 'إكمال الحصص', 'الانتقال إلى الدورة التالية', 'كل حصة معتمدة تقدم هذه الدورة. الحصص الجزئية لا تُحسب كمكتملة.', 'للبدء، اختر برنامجًا مسندًا بالفعل لهذا العميل. لن يتم نسخه أو تعديله.', 'استخدام هذا البرنامج', 'اختيار برنامج أو إنشاؤه', 'التحضير انطلاقًا من الدورة السابقة', 'عرض الأسابيع وتفاصيل الحصص'],
};
for (const [language, values] of Object.entries(guided)) {
  Object.assign(cycleTranslations[language], Object.fromEntries(guidedKeys.map((key, index) => [key, values[index]])));
}
const compactHints = {
  en: 'Your current programme and suggested next cycles. Select a cycle to view it.',
  es: 'Tu programa actual y los próximos ciclos propuestos. Selecciona un ciclo para verlo.',
  it: 'Il programma attuale e i prossimi cicli proposti. Seleziona un ciclo per visualizzarlo.',
  de: 'Aktuelles Programm und vorgeschlagene Folgezyklen. Einen Zyklus zum Ansehen auswählen.',
  ru: 'Текущая программа и предложенные следующие циклы. Выберите цикл для просмотра.',
  ar: 'برنامجك الحالي والدورات التالية المقترحة. اختر دورة للاطلاع عليها.',
};
for (const [language, compactHint] of Object.entries(compactHints)) cycleTranslations[language].compactHint = compactHint;
const sessionLabels = {
  en: ['Partial', 'To do', 'Compare this session', 'No exercise details recorded for this session.', 'Sessions outside the cycle dates'],
  es: ['Parcial', 'Pendiente', 'Comparar esta sesión', 'No hay detalles de ejercicios registrados para esta sesión.', 'Sesiones fuera de las fechas del ciclo'],
  it: ['Parziale', 'Da fare', 'Confronta questa sessione', 'Nessun dettaglio degli esercizi registrato per questa sessione.', 'Sessioni fuori dalle date del ciclo'],
  de: ['Teilweise', 'Offen', 'Diese Einheit vergleichen', 'Keine Übungsdetails für diese Einheit gespeichert.', 'Einheiten außerhalb des Zykluszeitraums'],
  ru: ['Частично', 'Предстоит', 'Сравнить тренировку', 'Детали упражнений для этой тренировки не сохранены.', 'Тренировки вне дат цикла'],
  ar: ['جزئية', 'لم تُنجز بعد', 'مقارنة هذه الحصة', 'لا توجد تفاصيل تمارين مسجلة لهذه الحصة.', 'حصص خارج تواريخ الدورة'],
};
const sequentialLabels = {
  en: ['Weeks advance with completed sessions, even after a break. Dates shown are the actual dates.', 'Partial sessions — not counted towards progress', 'Extra sessions after programme completion'],
  es: ['Las semanas avanzan con las sesiones terminadas, incluso tras una pausa. Se muestran las fechas reales.', 'Sesiones parciales — no cuentan para el progreso', 'Sesiones adicionales tras finalizar el programa'],
  it: ['Le settimane avanzano con le sessioni completate, anche dopo una pausa. Le date mostrate sono quelle reali.', 'Sessioni parziali — non contano nella progressione', 'Sessioni aggiuntive dopo la fine del programma'],
  de: ['Die Wochen folgen den abgeschlossenen Einheiten, auch nach einer Pause. Angezeigt werden die tatsächlichen Daten.', 'Teilweise absolvierte Einheiten — zählen nicht zum Fortschritt', 'Zusätzliche Einheiten nach Programmabschluss'],
  ru: ['Недели продвигаются по завершённым тренировкам, даже после перерыва. Показаны фактические даты.', 'Частичные тренировки — не учитываются в прогрессе', 'Дополнительные тренировки после завершения программы'],
  ar: ['تتقدم الأسابيع حسب الحصص المكتملة حتى بعد التوقف. التواريخ المعروضة هي التواريخ الفعلية.', 'حصص جزئية — لا تُحتسب ضمن التقدم', 'حصص إضافية بعد إكمال البرنامج'],
};
for (const [language, values] of Object.entries(sequentialLabels)) Object.assign(cycleTranslations[language], Object.fromEntries(['sequentialWeeks', 'partialAttempts', 'extraSessions'].map((key, index) => [key, values[index]])));
const preparationLabels = {
  en: ['Draft to finish', 'A draft exists for this cycle. Check exercises and loads, save, then assign the programme to the client.', 'Reuse the previous cycle’s exercises, then adapt them to this new stage before assigning.', 'Finish the programme', 'Prepare this cycle', 'Choose another programme', 'Link a programme already on this client profile to this cycle.', 'No programme is linked to this cycle yet. Choose one from your library, then assign it to this client.'],
  es: ['Borrador por finalizar', 'Ya existe un borrador para este ciclo. Revisa ejercicios y cargas, guarda y asigna el programa al cliente.', 'Reutiliza los ejercicios del ciclo anterior y adáptalos a esta nueva etapa antes de asignarlos.', 'Finalizar el programa', 'Preparar este ciclo', 'Elegir otro programa', 'Vincula a este ciclo un programa ya presente en esta ficha.', 'Este ciclo aún no tiene programa. Elige uno de tu biblioteca y asígnalo a este cliente.'],
  it: ['Bozza da completare', 'Esiste una bozza per questo ciclo. Verifica esercizi e carichi, salva, poi assegna il programma al cliente.', 'Riprendi gli esercizi del ciclo precedente e adattali alla nuova fase prima di assegnarli.', 'Completa il programma', 'Prepara questo ciclo', 'Scegli un altro programma', 'Collega a questo ciclo un programma già presente nella scheda.', 'Nessun programma è ancora collegato a questo ciclo. Scegline uno dalla libreria e assegnalo al cliente.'],
  de: ['Entwurf fertigstellen', 'Für diesen Zyklus gibt es einen Entwurf. Prüfe Übungen und Lasten, speichere und weise das Programm dem Kunden zu.', 'Übernimm die Übungen des vorherigen Zyklus und passe sie vor der Zuweisung an die neue Phase an.', 'Programm fertigstellen', 'Zyklus vorbereiten', 'Anderes Programm wählen', 'Verknüpfe ein Programm aus diesem Kundenprofil mit dem Zyklus.', 'Diesem Zyklus ist noch kein Programm zugeordnet. Wähle eines aus der Bibliothek und weise es dem Kunden zu.'],
  ru: ['Черновик для завершения', 'Для этого цикла есть черновик. Проверьте упражнения и нагрузки, сохраните и назначьте программу клиенту.', 'Возьмите упражнения предыдущего цикла и адаптируйте их к новому этапу перед назначением.', 'Доработать программу', 'Подготовить цикл', 'Выбрать другую программу', 'Свяжите с циклом программу, которая уже есть в карточке клиента.', 'С этим циклом пока не связана программа. Выберите её в библиотеке и назначьте клиенту.'],
  ar: ['مسودة بحاجة للإكمال', 'توجد مسودة لهذه الدورة. راجع التمارين والأوزان، ثم احفظ البرنامج وعيّنه للعميل.', 'استخدم تمارين الدورة السابقة ثم عدّلها لهذه المرحلة قبل تعيينها.', 'إكمال البرنامج', 'إعداد هذه الدورة', 'اختيار برنامج آخر', 'اربط بهذه الدورة برنامجًا موجودًا في ملف العميل.', 'لا يوجد برنامج مرتبط بهذه الدورة بعد. اختر برنامجًا من مكتبتك ثم عيّنه لهذا العميل.'],
};
for (const [language, values] of Object.entries(preparationLabels)) Object.assign(cycleTranslations[language], Object.fromEntries(['draftReady', 'draftNextAction', 'prepareNextAction', 'finishDraft', 'prepareCycle', 'chooseAlternative', 'linkExisting', 'noLinkedProgram'].map((key, index) => [key, values[index]])));
for (const [language, endurance] of Object.entries({ en: 'Muscular endurance', es: 'Resistencia muscular', it: 'Resistenza muscolare', de: 'Kraftausdauer', ru: 'Мышечная выносливость', ar: 'التحمل العضلي' })) cycleTranslations[language].endurance = endurance;
for (const [language, projected] of Object.entries({ en: 'Preconfigured', es: 'Preconfigurado', it: 'Preconfigurato', de: 'Vorkonfiguriert', ru: 'Предварительно настроен', ar: 'مُعد مسبقاً' })) cycleTranslations[language].projected = projected;
for (const [language, autoTransition] of Object.entries({
  en: 'All sessions are validated. The transition to the next cycle synchronises automatically.',
  es: 'Todas las sesiones están validadas. El paso al siguiente ciclo se sincroniza automáticamente.',
  it: 'Tutte le sessioni sono convalidate. Il passaggio al ciclo successivo si sincronizza automaticamente.',
  de: 'Alle Einheiten sind bestätigt. Der Wechsel zum nächsten Zyklus wird automatisch synchronisiert.',
  ru: 'Все тренировки подтверждены. Переход к следующему циклу синхронизируется автоматически.',
  ar: 'تم اعتماد جميع الحصص. تتم مزامنة الانتقال إلى الدورة التالية تلقائياً.',
})) cycleTranslations[language].autoTransition = autoTransition;
for (const [language, values] of Object.entries({
  en: ['Prepare a new version', 'The old draft stays in the library. The new version uses the previous programme and its results.'],
  es: ['Preparar una nueva versión', 'El borrador anterior permanece en la biblioteca. La nueva versión usa el programa anterior y sus resultados.'],
  it: ['Prepara una nuova versione', 'La vecchia bozza resta nella libreria. La nuova versione usa il programma precedente e i suoi risultati.'],
  de: ['Neue Version vorbereiten', 'Der alte Entwurf bleibt in der Bibliothek. Die neue Version nutzt das vorherige Programm und dessen Ergebnisse.'],
  ru: ['Подготовить новую версию', 'Старый черновик останется в библиотеке. Новая версия использует предыдущую программу и её результаты.'],
  ar: ['إعداد نسخة جديدة', 'تبقى المسودة القديمة في المكتبة. تستخدم النسخة الجديدة البرنامج السابق ونتائجه.'],
})) Object.assign(cycleTranslations[language], { regenerateDraft: values[0], preserveDraft: values[1] });
for (const [language, prepareNextAction] of Object.entries({
  fr: 'Créez un brouillon adapté à ce cycle, puis vérifiez-le dans le builder avant de l’assigner.',
  en: 'Create a cycle-adapted draft, then review it in the builder before assigning.',
  es: 'Crea un borrador adaptado al ciclo y revísalo en el editor antes de asignarlo.',
  it: 'Crea una bozza adattata al ciclo e verificala nel builder prima di assegnarla.',
  de: 'Erstelle einen angepassten Zyklusentwurf und prüfe ihn vor der Zuweisung im Builder.',
  ru: 'Создайте черновик для цикла и проверьте его в редакторе перед назначением.',
  ar: 'أنشئ مسودة مكيّفة للدورة ثم راجعها في المحرر قبل إسنادها.',
})) {
  cycleTranslations[language] ||= {};
  cycleTranslations[language].prepareNextAction = prepareNextAction;
}
const journeyLabels = {
  en: ['Your journey, step by step. Choose a cycle to see its sessions.', 'In progress', 'Upcoming', 'Completed sessions', 'Cycle target reached', 'Sessions and results'],
  es: ['Tu recorrido, paso a paso. Elige un ciclo para ver sus sesiones.', 'En curso', 'Próximo', 'Sesiones realizadas', 'Objetivo del ciclo alcanzado', 'Sesiones y resultados'],
  it: ['Il tuo percorso, passo dopo passo. Scegli un ciclo per vedere le sessioni.', 'In corso', 'In programma', 'Sessioni completate', 'Obiettivo del ciclo raggiunto', 'Sessioni e risultati'],
  de: ['Dein Weg, Schritt für Schritt. Wähle einen Zyklus, um seine Einheiten zu sehen.', 'Läuft', 'Geplant', 'Abgeschlossene Einheiten', 'Zyklusziel erreicht', 'Einheiten und Ergebnisse'],
  ru: ['Ваш путь, шаг за шагом. Выберите цикл, чтобы увидеть тренировки.', 'В процессе', 'Предстоит', 'Завершённые тренировки', 'Цель цикла достигнута', 'Тренировки и результаты'],
  ar: ['رحلتك خطوة بخطوة. اختر دورة لرؤية حصصها.', 'قيد التنفيذ', 'قادم', 'الحصص المنجزة', 'تم تحقيق هدف الدورة', 'الحصص والنتائج'],
};
for (const [language, values] of Object.entries(journeyLabels)) Object.assign(cycleTranslations[language], Object.fromEntries(['journeyHint', 'currentCycle', 'upcomingCycle', 'completedSessions', 'milestone', 'sessionsResults'].map((key, index) => [key, values[index]])));
const nextSessionLabels = {
  en: ['Start the next session', 'Duration taken from the linked programme.'],
  es: ['Empezar la siguiente sesión', 'Duración del programa asociado.'],
  it: ['Inizia la prossima sessione', 'Durata del programma associato.'],
  de: ['Nächste Einheit starten', 'Dauer aus dem verknüpften Programm.'],
  ru: ['Начать следующую тренировку', 'Длительность связанной программы.'],
  ar: ['بدء الحصة التالية', 'المدة مأخوذة من البرنامج المرتبط.'],
};
for (const [language, values] of Object.entries(nextSessionLabels)) Object.assign(cycleTranslations[language], { startNextSession: values[0], durationFromProgram: values[1] });
for (const [language, values] of Object.entries(sessionLabels)) Object.assign(cycleTranslations[language], Object.fromEntries(['partial', 'todo', 'compare', 'noResults', 'outsideDates'].map((key, index) => [key, values[index]])));
