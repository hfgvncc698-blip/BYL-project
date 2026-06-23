const normalizeLang = (lang = "fr") => {
  const raw = String(lang || "fr").toLowerCase();
  return raw.split(/[-_]/)[0] || "fr";
};

const TRANSLATIONS = {
  fr: {
    perLeg: "À réaliser par jambe.",
    perSide: "À réaliser par côté.",
    maxReps: "Maximum de répétitions propres.",
    initialRange: (range) => `Plage initiale : ${range} répétitions.`,
  },
  en: {
    perLeg: "Perform on each leg.",
    perSide: "Perform on each side.",
    maxReps: "Maximum clean repetitions.",
    initialRange: (range) => `Initial range: ${range} reps.`,
  },
  it: {
    perLeg: "Da eseguire per gamba.",
    perSide: "Da eseguire per lato.",
    maxReps: "Massimo numero di ripetizioni pulite.",
    initialRange: (range) => `Intervallo iniziale: ${range} ripetizioni.`,
  },
  es: {
    perLeg: "Realizar por pierna.",
    perSide: "Realizar por lado.",
    maxReps: "Máximo de repeticiones limpias.",
    initialRange: (range) => `Rango inicial: ${range} repeticiones.`,
  },
  de: {
    perLeg: "Pro Bein ausführen.",
    perSide: "Pro Seite ausführen.",
    maxReps: "Maximal saubere Wiederholungen.",
    initialRange: (range) => `Ausgangsbereich: ${range} Wiederholungen.`,
  },
  ru: {
    perLeg: "Выполнять на каждую ногу.",
    perSide: "Выполнять на каждую сторону.",
    maxReps: "Максимум чистых повторений.",
    initialRange: (range) => `Начальный диапазон: ${range} повторений.`,
  },
  ar: {
    perLeg: "ينفذ لكل ساق.",
    perSide: "ينفذ لكل جانب.",
    maxReps: "أكبر عدد من التكرارات النظيفة.",
    initialRange: (range) => `النطاق المبدئي: ${range} تكرارات.`,
  },
};

const getDict = (lang) => TRANSLATIONS[normalizeLang(lang)] || TRANSLATIONS.fr;

const LOCALIZED_NOTE_MAP = {
  "amplitude progressive et respiration calme.": {
    fr: "Amplitude progressive et respiration calme.",
    en: "Progressive range of motion with calm breathing.",
    it: "Ampiezza progressiva e respirazione calma.",
    es: "Amplitud progresiva y respiración tranquila.",
    de: "Progressiver Bewegungsumfang und ruhige Atmung.",
    ru: "Постепенно увеличивайте амплитуду и дышите спокойно.",
    ar: "مدى حركة تدريجي مع تنفس هادئ.",
  },
  "controle, amplitude progressive.": {
    fr: "Contrôle, amplitude progressive.",
    en: "Controlled movement with progressive range.",
    it: "Movimento controllato con ampiezza progressiva.",
    es: "Movimiento controlado con amplitud progresiva.",
    de: "Kontrollierte Bewegung mit progressivem Umfang.",
    ru: "Контролируемое движение с постепенным увеличением амплитуды.",
    ar: "حركة مضبوطة مع مدى تدريجي.",
  },
  "monter doucement le rythme.": {
    fr: "Monter doucement le rythme.",
    en: "Gradually increase the pace.",
    it: "Aumenta gradualmente il ritmo.",
    es: "Aumenta progresivamente el ritmo.",
    de: "Das Tempo langsam steigern.",
    ru: "Постепенно повышайте темп.",
    ar: "ارفع الإيقاع تدريجيًا.",
  },
  "monter le rythme sans se crisper.": {
    fr: "Monter le rythme sans se crisper.",
    en: "Increase the pace without tensing up.",
    it: "Aumenta il ritmo senza irrigidirti.",
    es: "Aumenta el ritmo sin tensarte.",
    de: "Das Tempo steigern, ohne zu verkrampfen.",
    ru: "Повышайте темп, не напрягаясь.",
    ar: "ارفع الإيقاع دون توتر.",
  },
  "relacher le ventre et ralentir la respiration.": {
    fr: "Relâcher le ventre et ralentir la respiration.",
    en: "Relax the abdomen and slow your breathing.",
    it: "Rilassa l'addome e rallenta la respirazione.",
    es: "Relaja el abdomen y ralentiza la respiración.",
    de: "Den Bauch entspannen und die Atmung verlangsamen.",
    ru: "Расслабьте живот и замедлите дыхание.",
    ar: "أرخ البطن وأبطئ التنفس.",
  },
  "garder une tension confortable, sans douleur.": {
    fr: "Garder une tension confortable, sans douleur.",
    en: "Keep a comfortable stretch, without pain.",
    it: "Mantieni una tensione confortevole, senza dolore.",
    es: "Mantén una tensión cómoda, sin dolor.",
    de: "Eine angenehme Spannung halten, ohne Schmerzen.",
    ru: "Удерживайте комфортное натяжение без боли.",
    ar: "حافظ على شد مريح دون ألم.",
  },
  "respiration nasale lente.": {
    fr: "Respiration nasale lente.",
    en: "Slow nasal breathing.",
    it: "Respirazione nasale lenta.",
    es: "Respiración nasal lenta.",
    de: "Langsame Nasenatmung.",
    ru: "Медленное дыхание через нос.",
    ar: "تنفس أنفي بطيء.",
  },
  "sans douleur, maintenir une tension confortable.": {
    fr: "Sans douleur, maintenir une tension confortable.",
    en: "Stay pain-free and keep a comfortable stretch.",
    it: "Senza dolore, mantieni una tensione confortevole.",
    es: "Sin dolor, mantén una tensión cómoda.",
    de: "Schmerzfrei bleiben und eine angenehme Spannung halten.",
    ru: "Без боли, удерживайте комфортное натяжение.",
    ar: "دون ألم، حافظ على شد مريح.",
  },
  "garder le buste solide et une amplitude propre.": {
    fr: "Garder le buste solide et une amplitude propre.",
    en: "Keep the torso braced and the range clean.",
    it: "Mantieni il busto stabile e un'ampiezza pulita.",
    es: "Mantén el torso firme y una amplitud limpia.",
    de: "Den Oberkörper stabil halten und sauber bewegen.",
    ru: "Держите корпус устойчивым и выполняйте движение чисто.",
    ar: "حافظ على ثبات الجذع ومدى حركة نظيف.",
  },
  "hanches vers l'arriere, dos neutre.": {
    fr: "Hanches vers l'arrière, dos neutre.",
    en: "Hips back, neutral back.",
    it: "Anche indietro, schiena neutra.",
    es: "Caderas hacia atrás, espalda neutra.",
    de: "Hüfte nach hinten, Rücken neutral.",
    ru: "Таз назад, спина нейтральная.",
    ar: "ادفع الوركين للخلف مع ظهر محايد.",
  },
  "pause courte en haut du mouvement.": {
    fr: "Pause courte en haut du mouvement.",
    en: "Brief pause at the top of the movement.",
    it: "Breve pausa nella parte alta del movimento.",
    es: "Pausa breve arriba del movimiento.",
    de: "Kurze Pause am oberen Bewegungsende.",
    ru: "Короткая пауза в верхней точке движения.",
    ar: "توقف قصير في أعلى الحركة.",
  },
  "garder la trajectoire propre et une poussee controlee.": {
    fr: "Garder la trajectoire propre et une poussée contrôlée.",
    en: "Keep the path clean and the push controlled.",
    it: "Mantieni la traiettoria pulita e una spinta controllata.",
    es: "Mantén una trayectoria limpia y un empuje controlado.",
    de: "Die Bewegungslinie sauber und den Druck kontrolliert halten.",
    ru: "Сохраняйте чистую траекторию и контролируемое усилие.",
    ar: "حافظ على مسار نظيف ودفع مضبوط.",
  },
  "respiration lente, sans douleur.": {
    fr: "Respiration lente, sans douleur.",
    en: "Slow breathing, without pain.",
    it: "Respirazione lenta, senza dolore.",
    es: "Respiración lenta, sin dolor.",
    de: "Langsame Atmung, ohne Schmerzen.",
    ru: "Медленное дыхание, без боли.",
    ar: "تنفس بطيء دون ألم.",
  },
};

export const noteValueToText = (value) => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(noteValueToText).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(noteValueToText).filter(Boolean).join("\n");
  return String(value).trim();
};

const normalizeForCompare = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const translateExerciseNote = (note, lang = "fr") => {
  const raw = String(note || "").trim();
  if (!raw) return "";
  const normalized = normalizeForCompare(raw);
  const dict = getDict(lang);
  const targetLang = normalizeLang(lang);
  const localized = LOCALIZED_NOTE_MAP[normalized];
  if (localized) return localized[targetLang] || localized.fr || raw;

  const rangeMatch = normalized.match(/plage initiale\s*:?\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?)\s*(?:repetitions|reps)?/);
  if (rangeMatch?.[1]) {
    return dict.initialRange(rangeMatch[1].replace(/\s+/g, ""));
  }

  if (
    normalized.includes("maximum de repetitions propres") ||
    normalized === "maximum" ||
    normalized.includes("max propre") ||
    normalized.includes("amrap")
  ) {
    return dict.maxReps;
  }

  if (normalized.includes("par jambe")) return dict.perLeg;
  if (normalized.includes("par cote") || normalized.includes("par côté")) return dict.perSide;

  return raw;
};

export const getExerciseNoteLines = (exercise, lang = "fr") => {
  if (!exercise || typeof exercise !== "object") return [];
  const rawParts = [
    noteValueToText(exercise.notes),
    noteValueToText(exercise.note),
    noteValueToText(exercise.consigne),
  ].filter(Boolean);

  const lines = [];
  rawParts
    .flatMap((part) => String(part).split(/\n+/))
    .map((part) => translateExerciseNote(part, lang))
    .filter(Boolean)
    .forEach((part) => {
      const normalized = normalizeForCompare(part);
      if (lines.some((existing) => normalizeForCompare(existing) === normalized)) return;
      lines.push(part);
    });

  return lines;
};

export const getExerciseNotesText = (exercise, lang = "fr") =>
  getExerciseNoteLines(exercise, lang).join("\n");
