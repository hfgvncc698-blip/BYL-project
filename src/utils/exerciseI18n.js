const SUPPORTED_LANGS = ["fr", "en", "it", "es", "de", "ru", "ar"];

const normalizeLang = (lng = "fr") => {
  const code = String(lng || "fr").toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGS.includes(code) ? code : "fr";
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isLangMap = (value) =>
  isPlainObject(value) && SUPPORTED_LANGS.some((lng) => value[lng] !== undefined);

const firstDefined = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return undefined;
};

const localizeLangMap = (map, lng, fallbackLng = "fr") =>
  firstDefined(map?.[lng], map?.[fallbackLng], map?.fr, map?.en, ...Object.values(map || {}));

const TERM_TRANSLATIONS = {
  "Aucun": { en: "None", it: "Nessuno", es: "Ninguno", de: "Keine", ru: "Нет", ar: "لا شيء" },
  "Tous niveaux": { en: "All levels", it: "Tutti i livelli", es: "Todos los niveles", de: "Alle Niveaus", ru: "Все уровни", ar: "كل المستويات" },
  "Débutant": { en: "Beginner", it: "Principiante", es: "Principiante", de: "Anfänger", ru: "Начинающий", ar: "مبتدئ" },
  "Intermédiaire": { en: "Intermediate", it: "Intermedio", es: "Intermedio", de: "Mittelstufe", ru: "Средний", ar: "متوسط" },
  "Avancé": { en: "Advanced", it: "Avanzato", es: "Avanzado", de: "Fortgeschritten", ru: "Продвинутый", ar: "متقدم" },
  "Debout": { en: "Standing", it: "In piedi", es: "De pie", de: "Stehend", ru: "Стоя", ar: "وقوف" },
  "Assis": { en: "Seated", it: "Seduto", es: "Sentado", de: "Sitzend", ru: "Сидя", ar: "جلوس" },
  "Allongé": { en: "Lying down", it: "Sdraiato", es: "Tumbado", de: "Liegend", ru: "Лежа", ar: "استلقاء" },
  "Sur le dos": { en: "On the back", it: "Supino", es: "Boca arriba", de: "Auf dem Rücken", ru: "На спине", ar: "على الظهر" },
  "Incliné": { en: "Inclined", it: "Inclinato", es: "Inclinado", de: "Schräg", ru: "Под наклоном", ar: "مائل" },
  "Échauffement": { en: "Warm-up", it: "Riscaldamento", es: "Calentamiento", de: "Aufwärmen", ru: "Разминка", ar: "إحماء" },
  "Renforcement": { en: "Strengthening", it: "Rinforzo", es: "Fortalecimiento", de: "Kräftigung", ru: "Укрепление", ar: "تقوية" },
  "Hypertrophie": { en: "Hypertrophy", it: "Ipertrofia", es: "Hipertrofia", de: "Hypertrophie", ru: "Гипертрофия", ar: "تضخم عضلي" },
  "Endurance": { en: "Endurance", it: "Resistenza", es: "Resistencia", de: "Ausdauer", ru: "Выносливость", ar: "تحمل" },
  "Force": { en: "Strength", it: "Forza", es: "Fuerza", de: "Kraft", ru: "Сила", ar: "قوة" },
  "Postural": { en: "Postural", it: "Posturale", es: "Postural", de: "Haltungsorientiert", ru: "Постуральный", ar: "وضعي" },
  "Cardio": { en: "Cardio", it: "Cardio", es: "Cardio", de: "Cardio", ru: "Кардио", ar: "كارديو" },
  "Mobilité": { en: "Mobility", it: "Mobilità", es: "Movilidad", de: "Mobilität", ru: "Мобильность", ar: "حركية" },
  "Équilibre": { en: "Balance", it: "Equilibrio", es: "Equilibrio", de: "Gleichgewicht", ru: "Баланс", ar: "توازن" },
  "Stabilité": { en: "Stability", it: "Stabilità", es: "Estabilidad", de: "Stabilität", ru: "Стабильность", ar: "ثبات" },
  "Gainage": { en: "Core bracing", it: "Core stability", es: "Core", de: "Rumpfstabilität", ru: "Кор", ar: "تثبيت الجذع" },
  "Perte de poids": { en: "Weight loss", it: "Perdita di peso", es: "Pérdida de peso", de: "Gewichtsverlust", ru: "Снижение веса", ar: "فقدان الوزن" },
  "Remise en forme": { en: "Fitness", it: "Forma fisica", es: "Puesta en forma", de: "Fitness", ru: "Фитнес", ar: "لياقة عامة" },
  "Remise au sport": { en: "Return to sport", it: "Ritorno allo sport", es: "Vuelta al deporte", de: "Rückkehr zum Sport", ru: "Возвращение к спорту", ar: "العودة للرياضة" },
  "Prise de masse": { en: "Muscle gain", it: "Aumento massa", es: "Ganancia muscular", de: "Muskelaufbau", ru: "Набор массы", ar: "زيادة الكتلة" },
  "Jambes": { en: "Legs", it: "Gambe", es: "Piernas", de: "Beine", ru: "Ноги", ar: "الساقان" },
  "Épaules": { en: "Shoulders", it: "Spalle", es: "Hombros", de: "Schultern", ru: "Плечи", ar: "الأكتاف" },
  "Dos": { en: "Back", it: "Schiena", es: "Espalda", de: "Rücken", ru: "Спина", ar: "الظهر" },
  "Pectoraux": { en: "Chest", it: "Pettorali", es: "Pectorales", de: "Brust", ru: "Грудные мышцы", ar: "الصدر" },
  "Abdominaux": { en: "Abs", it: "Addominali", es: "Abdominales", de: "Bauchmuskeln", ru: "Пресс", ar: "عضلات البطن" },
  "Fessiers": { en: "Glutes", it: "Glutei", es: "Glúteos", de: "Gesäßmuskeln", ru: "Ягодичные мышцы", ar: "الألوية" },
  "Quadriceps": { en: "Quadriceps", it: "Quadricipiti", es: "Cuádriceps", de: "Quadrizeps", ru: "Квадрицепсы", ar: "العضلة الرباعية" },
  "Ischio-jambiers": { en: "Hamstrings", it: "Ischiocrurali", es: "Isquiotibiales", de: "Ischiocrurale Muskeln", ru: "Задняя поверхность бедра", ar: "أوتار الركبة" },
  "Mollets": { en: "Calves", it: "Polpacci", es: "Gemelos", de: "Waden", ru: "Икры", ar: "الربلتان" },
  "Biceps": { en: "Biceps", it: "Bicipiti", es: "Bíceps", de: "Bizeps", ru: "Бицепсы", ar: "العضلة ذات الرأسين" },
  "Triceps": { en: "Triceps", it: "Tricipiti", es: "Tríceps", de: "Trizeps", ru: "Трицепсы", ar: "العضلة ثلاثية الرؤوس" },
  "Avant-bras": { en: "Forearms", it: "Avambracci", es: "Antebrazos", de: "Unterarme", ru: "Предплечья", ar: "الساعدان" },
  "Trapèzes": { en: "Trapezius", it: "Trapezi", es: "Trapecios", de: "Trapezmuskel", ru: "Трапеции", ar: "العضلة شبه المنحرفة" },
  "Lombaires": { en: "Lower back", it: "Lombari", es: "Lumbares", de: "Lendenbereich", ru: "Поясница", ar: "أسفل الظهر" },
  "Obliques": { en: "Obliques", it: "Obliqui", es: "Oblicuos", de: "Schräge Bauchmuskeln", ru: "Косые мышцы", ar: "العضلات المائلة" },
  "Transverse": { en: "Transverse abdominis", it: "Trasverso", es: "Transverso", de: "Transversus", ru: "Поперечная мышца", ar: "العضلة المستعرضة" },
  "Adducteurs": { en: "Adductors", it: "Adduttori", es: "Aductores", de: "Adduktoren", ru: "Приводящие мышцы", ar: "المقربات" },
  "Chevilles": { en: "Ankles", it: "Caviglie", es: "Tobillos", de: "Sprunggelenke", ru: "Голеностопы", ar: "الكاحلان" },
  "Genoux": { en: "Knees", it: "Ginocchia", es: "Rodillas", de: "Knie", ru: "Колени", ar: "الركبتان" },
  "Hanches": { en: "Hips", it: "Anche", es: "Caderas", de: "Hüften", ru: "Тазобедренные суставы", ar: "الوركان" },
  "Coudes": { en: "Elbows", it: "Gomiti", es: "Codos", de: "Ellbogen", ru: "Локти", ar: "المرفقان" },
  "Poignets": { en: "Wrists", it: "Polsi", es: "Muñecas", de: "Handgelenke", ru: "Запястья", ar: "المعصمان" },
  "Colonne vertébrale": { en: "Spine", it: "Colonna vertebrale", es: "Columna vertebral", de: "Wirbelsäule", ru: "Позвоночник", ar: "العمود الفقري" },
  "Rachis lombaire": { en: "Lumbar spine", it: "Rachide lombare", es: "Columna lumbar", de: "Lendenwirbelsäule", ru: "Поясничный отдел", ar: "الفقرات القطنية" },
  "Poids du corps": { en: "Bodyweight", it: "Peso corporeo", es: "Peso corporal", de: "Körpergewicht", ru: "Собственный вес", ar: "وزن الجسم" },
  "Haltères": { en: "Dumbbells", it: "Manubri", es: "Mancuernas", de: "Kurzhanteln", ru: "Гантели", ar: "دمبل" },
  "Barre": { en: "Barbell", it: "Bilanciere", es: "Barra", de: "Langhantel", ru: "Штанга", ar: "بار" },
  "Élastique": { en: "Resistance band", it: "Elastico", es: "Banda elástica", de: "Widerstandsband", ru: "Резинка", ar: "رباط مقاومة" },
  "Banc": { en: "Bench", it: "Panca", es: "Banco", de: "Bank", ru: "Скамья", ar: "مقعد" },
  "Machine": { en: "Machine", it: "Macchina", es: "Máquina", de: "Maschine", ru: "Тренажер", ar: "جهاز" },
  "Poulie": { en: "Cable pulley", it: "Cavo", es: "Polea", de: "Kabelzug", ru: "Блок", ar: "بكرة" },
  "Tapis": { en: "Mat", it: "Tappetino", es: "Colchoneta", de: "Matte", ru: "Коврик", ar: "بساط" },
  "Mur": { en: "Wall", it: "Parete", es: "Pared", de: "Wand", ru: "Стена", ar: "حائط" },
  "TRX": { en: "TRX", it: "TRX", es: "TRX", de: "TRX", ru: "TRX", ar: "TRX" },
  "Corps entier": { en: "Full body", it: "Tutto il corpo", es: "Cuerpo completo", de: "Ganzkörper", ru: "Все тело", ar: "الجسم بالكامل" },
  "Full Body": { en: "Full body", it: "Tutto il corpo", es: "Cuerpo completo", de: "Ganzkörper", ru: "Все тело", ar: "الجسم بالكامل" },
  "Exercice au poids du corps": { en: "Bodyweight exercise", it: "Esercizio a corpo libero", es: "Ejercicio con peso corporal", de: "Körpergewichtsübung", ru: "Упражнение с собственным весом", ar: "تمرين بوزن الجسم" },
  "Préparation articulaire": { en: "Joint preparation", it: "Preparazione articolare", es: "Preparación articular", de: "Gelenkvorbereitung", ru: "Подготовка суставов", ar: "تحضير المفاصل" },
  "Tendon rotulien": { en: "Patellar tendon", it: "Tendine rotuleo", es: "Tendón rotuliano", de: "Patellarsehne", ru: "Связка надколенника", ar: "وتر الرضفة" },
  "Tendon d'Achille": { en: "Achilles tendon", it: "Tendine d'Achille", es: "Tendón de Aquiles", de: "Achillessehne", ru: "Ахиллово сухожилие", ar: "وتر أخيل" },
  "Tendon d’Achille": { en: "Achilles tendon", it: "Tendine d'Achille", es: "Tendón de Aquiles", de: "Achillessehne", ru: "Ахиллово сухожилие", ar: "وتر أخيل" },
  "Tendon des ischio-jambiers": { en: "Hamstring tendon", it: "Tendine degli ischiocrurali", es: "Tendón isquiotibial", de: "Ischiocrurale Sehne", ru: "Сухожилие задней поверхности бедра", ar: "وتر أوتار الركبة" },
  "Tendon du biceps brachial": { en: "Biceps brachii tendon", it: "Tendine del bicipite brachiale", es: "Tendón del bíceps braquial", de: "Bizepssehne", ru: "Сухожилие двуглавой мышцы", ar: "وتر العضلة ذات الرأسين" },
  "Tendon du triceps": { en: "Triceps tendon", it: "Tendine del tricipite", es: "Tendón del tríceps", de: "Trizepssehne", ru: "Сухожилие трицепса", ar: "وتر ثلاثية الرؤوس" },
};

const localizeTerm = (value, lng = "fr") => {
  const lang = normalizeLang(lng);
  const raw = String(value || "").trim();
  if (!raw || lang === "fr") return value;
  return TERM_TRANSLATIONS[raw]?.[lang] || value;
};

export const localizeValue = (value, lng = "fr", fallbackLng = "fr") => {
  const lang = normalizeLang(lng);
  const fallback = normalizeLang(fallbackLng);

  if (typeof value === "string") return localizeTerm(value, lang);

  if (Array.isArray(value)) {
    return value.map((item) => localizeValue(item, lang, fallback));
  }

  if (!isPlainObject(value)) return value;

  if (isLangMap(value)) {
    return localizeValue(localizeLangMap(value, lang, fallback), lang, fallback);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, localizeValue(nested, lang, fallback)])
  );
};

const localizedContainerKeys = ["translations", "i18n", "localized", "locales"];

const pickLocalizedField = (exercise, field, lng, fallbackLng = "fr") => {
  if (!exercise) return undefined;
  const lang = normalizeLang(lng);
  const fallback = normalizeLang(fallbackLng);
  if (lang === "fr") return undefined;

  const suffixCandidates = [
    exercise[`${field}_${lang}`],
    exercise[`${field}${lang.toUpperCase()}`],
    exercise[`${field}_${fallback}`],
    exercise[`${field}${fallback.toUpperCase()}`],
  ];

  const nestedCandidates = localizedContainerKeys.flatMap((containerKey) => {
    const container = exercise[containerKey];
    return [
      container?.[lang]?.[field],
      container?.[fallback]?.[field],
      container?.fr?.[field],
    ];
  });

  return firstDefined(...suffixCandidates, ...nestedCandidates);
};

const localizeExerciseField = (exercise, field, lng, fallbackLng) => {
  const override = pickLocalizedField(exercise, field, lng, fallbackLng);
  return localizeValue(firstDefined(override, exercise?.[field]), lng, fallbackLng);
};

export const CUE_LABELS = {
  Positionnement: {
    fr: "Positionnement",
    en: "Setup",
    it: "Posizionamento",
    es: "Colocación",
    de: "Ausgangsposition",
    ru: "Исходное положение",
    ar: "الوضعية",
  },
  Mouvement: {
    fr: "Mouvement",
    en: "Movement",
    it: "Movimento",
    es: "Movimiento",
    de: "Bewegung",
    ru: "Движение",
    ar: "الحركة",
  },
  Retour: {
    fr: "Retour",
    en: "Return",
    it: "Ritorno",
    es: "Vuelta",
    de: "Rückkehr",
    ru: "Возврат",
    ar: "العودة",
  },
  Respiration: {
    fr: "Respiration",
    en: "Breathing",
    it: "Respirazione",
    es: "Respiración",
    de: "Atmung",
    ru: "Дыхание",
    ar: "التنفس",
  },
  Posture: {
    fr: "Posture",
    en: "Posture",
    it: "Postura",
    es: "Postura",
    de: "Haltung",
    ru: "Положение тела",
    ar: "القامة",
  },
};

const CUE_ORDER = ["Posture", "Positionnement", "Mouvement", "Retour", "Respiration"];

const normalizeCueKey = (label) => {
  const raw = String(label || "").trim();
  const lower = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const found = Object.keys(CUE_LABELS).find((key) => {
    const normalizedKey = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (lower === normalizedKey) return true;
    return SUPPORTED_LANGS.some((lng) => {
      const translated = CUE_LABELS[key]?.[lng];
      return (
        translated &&
        translated
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase() === lower
      );
    });
  });

  return found || raw;
};

export const localizeCueLabel = (label, lng = "fr") => {
  const lang = normalizeLang(lng);
  const raw = normalizeCueKey(label);
  return CUE_LABELS[raw]?.[lang] || CUE_LABELS[raw]?.fr || raw;
};

export const localizeConsignes = (consignes, lng = "fr", fallbackLng = "fr") => {
  const localized = localizeValue(consignes, lng, fallbackLng);

  if (!isPlainObject(localized) || Array.isArray(localized)) return localized;

  const entries = Object.entries(localized).map(([key, value]) => ({
    canonical: normalizeCueKey(key),
    label: localizeCueLabel(key, lng),
    value,
  }));

  const ordered = [];
  CUE_ORDER.forEach((cueKey) => {
    const found = entries.find((entry) => entry.canonical === cueKey);
    if (found) ordered.push(found);
  });
  entries.forEach((entry) => {
    if (!ordered.some((orderedEntry) => orderedEntry.label === entry.label)) ordered.push(entry);
  });

  return Object.fromEntries(ordered.map((entry) => [entry.label, entry.value]));
};

const TRANSLATABLE_FIELDS = [
  "nom",
  "name",
  "title",
  "label",
  "categorie",
  "categorie_utilisation",
  "groupe_musculaire",
  "objectifs",
  "muscles_secondaires",
  "articulations_solicitees",
  "articulations_sollicitees",
  "tendons_solicites",
  "tendons_sollicites",
  "type",
  "niveau",
  "materiel",
  "position",
  "contraintes",
  "variantes",
];

export const localizeExercise = (exercise, lng = "fr", fallbackLng = "fr") => {
  if (!exercise || typeof exercise !== "object") return exercise;

  const localized = { ...exercise };

  TRANSLATABLE_FIELDS.forEach((field) => {
    const value = localizeExerciseField(exercise, field, lng, fallbackLng);
    if (value !== undefined) localized[field] = value;
  });

  const consignes = pickLocalizedField(exercise, "consignes", lng, fallbackLng);
  localized.consignes = localizeConsignes(firstDefined(consignes, exercise.consignes), lng, fallbackLng);

  if (!localized.nom && localized.name) localized.nom = localized.name;
  if (!localized.name && localized.nom) localized.name = localized.nom;

  return localized;
};

export const localizeExerciseList = (list, lng = "fr", fallbackLng = "fr") =>
  Array.isArray(list) ? list.map((exercise) => localizeExercise(exercise, lng, fallbackLng)) : [];
