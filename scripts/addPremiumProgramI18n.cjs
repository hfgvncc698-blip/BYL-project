// scripts/addPremiumProgramI18n.cjs
/**
 * Ajoute des traductions aux programmes premium Firestore.
 *
 * Usage:
 *   node scripts/addPremiumProgramI18n.cjs
 *   node scripts/addPremiumProgramI18n.cjs --commit
 */

const path = require("path");
const admin = require("firebase-admin");

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, "../backend/serviceAccountKey.json");
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

const LANGS = ["fr", "en", "it", "es", "de", "ru", "ar"];

const TERMS = {
  en: {
    objective: {
      "Prise de masse": "Muscle gain",
      "Perte de poids": "Weight loss",
      Force: "Strength",
      Posture: "Posture",
      Musculation: "Strength training",
      "Sèche": "Cutting",
      Forme: "Fitness",
      Reprise: "Return to training",
      Renforcement: "Strengthening",
      Cardio: "Cardio",
      "Mobilité": "Mobility",
      "Athlétique": "Athletic",
      Gainage: "Core",
      Hypertrophie: "Hypertrophy",
      Hybride: "Hybrid",
    },
    level: { Débutant: "Beginner", Intermédiaire: "Intermediate", Avancé: "Advanced", Avance: "Advanced", "Tous niveaux": "All levels" },
    location: { Domicile: "Home", "Salle de sport": "Gym", "Domicile équipé": "Equipped home", "Domicile ou salle": "Home or gym", "Salle ou domicile equipe": "Gym or equipped home" },
    programLine: (name, goal, sessions, duration) => `${name} is a premium ${goal.toLowerCase()} plan with ${sessions || "several"} sessions per week and sessions up to ${duration || 45} minutes.`,
    benefit: (goal) => [`Clear progression for ${goal.toLowerCase()}`, "Warm-up, main block and cool-down included", "Exercises matched with the current exercise bank", "Designed for a structured training week"],
    sessionPreview: (focus) => `A structured session focused on ${focus.toLowerCase()}, with warm-up, main work and cool-down included.`,
  },
  it: {
    objective: {
      "Prise de masse": "Massa muscolare",
      "Perte de poids": "Perdita di peso",
      Force: "Forza",
      Posture: "Postura",
      Musculation: "Allenamento forza",
      "Sèche": "Definizione",
      Forme: "Forma",
      Reprise: "Ripresa",
      Renforcement: "Rinforzo",
      Cardio: "Cardio",
      "Mobilité": "Mobilità",
      "Athlétique": "Atletico",
      Gainage: "Core",
      Hypertrophie: "Ipertrofia",
      Hybride: "Ibrido",
    },
    level: { Débutant: "Principiante", Intermédiaire: "Intermedio", Avancé: "Avanzato", Avance: "Avanzato", "Tous niveaux": "Tutti i livelli" },
    location: { Domicile: "Casa", "Salle de sport": "Palestra", "Domicile équipé": "Casa attrezzata", "Domicile ou salle": "Casa o palestra", "Salle ou domicile equipe": "Palestra o casa attrezzata" },
    programLine: (name, goal, sessions, duration) => `${name} è un programma premium per ${goal.toLowerCase()} con ${sessions || "più"} sedute a settimana e sessioni fino a ${duration || 45} minuti.`,
    benefit: (goal) => [`Progressione chiara per ${goal.toLowerCase()}`, "Riscaldamento, blocco principale e defaticamento inclusi", "Esercizi collegati alla banca dati attuale", "Pensato per una settimana di allenamento strutturata"],
    sessionPreview: (focus) => `Una seduta strutturata su ${focus.toLowerCase()}, con riscaldamento, lavoro principale e defaticamento.`,
  },
  es: {
    objective: {
      "Prise de masse": "Ganancia muscular",
      "Perte de poids": "Pérdida de peso",
      Force: "Fuerza",
      Posture: "Postura",
      Musculation: "Musculación",
      "Sèche": "Definición",
      Forme: "Forma física",
      Reprise: "Retomar entrenamiento",
      Renforcement: "Fortalecimiento",
      Cardio: "Cardio",
      "Mobilité": "Movilidad",
      "Athlétique": "Atlético",
      Gainage: "Core",
      Hypertrophie: "Hipertrofia",
      Hybride: "Híbrido",
    },
    level: { Débutant: "Principiante", Intermédiaire: "Intermedio", Avancé: "Avanzado", Avance: "Avanzado", "Tous niveaux": "Todos los niveles" },
    location: { Domicile: "Casa", "Salle de sport": "Gimnasio", "Domicile équipé": "Casa equipada", "Domicile ou salle": "Casa o gimnasio", "Salle ou domicile equipe": "Gimnasio o casa equipada" },
    programLine: (name, goal, sessions, duration) => `${name} es un programa premium de ${goal.toLowerCase()} con ${sessions || "varias"} sesiones por semana y entrenamientos de hasta ${duration || 45} minutos.`,
    benefit: (goal) => [`Progresión clara para ${goal.toLowerCase()}`, "Calentamiento, bloque principal y vuelta a la calma incluidos", "Ejercicios vinculados a la base actual", "Diseñado para una semana de entrenamiento estructurada"],
    sessionPreview: (focus) => `Una sesión estructurada centrada en ${focus.toLowerCase()}, con calentamiento, trabajo principal y vuelta a la calma.`,
  },
  de: {
    objective: {
      "Prise de masse": "Muskelaufbau",
      "Perte de poids": "Gewichtsverlust",
      Force: "Kraft",
      Posture: "Haltung",
      Musculation: "Krafttraining",
      "Sèche": "Definition",
      Forme: "Fitness",
      Reprise: "Wiedereinstieg",
      Renforcement: "Kräftigung",
      Cardio: "Cardio",
      "Mobilité": "Mobilität",
      "Athlétique": "Athletisch",
      Gainage: "Core",
      Hypertrophie: "Hypertrophie",
      Hybride: "Hybrid",
    },
    level: { Débutant: "Anfänger", Intermédiaire: "Fortgeschritten", Avancé: "Fortgeschritten", Avance: "Fortgeschritten", "Tous niveaux": "Alle Niveaus" },
    location: { Domicile: "Zuhause", "Salle de sport": "Fitnessstudio", "Domicile équipé": "Ausgestattetes Zuhause", "Domicile ou salle": "Zuhause oder Studio", "Salle ou domicile equipe": "Studio oder ausgestattetes Zuhause" },
    programLine: (name, goal, sessions, duration) => `${name} ist ein Premiumprogramm für ${goal.toLowerCase()} mit ${sessions || "mehreren"} Einheiten pro Woche und Einheiten bis ${duration || 45} Minuten.`,
    benefit: (goal) => [`Klare Progression für ${goal.toLowerCase()}`, "Aufwärmen, Hauptteil und Cool-down inklusive", "Übungen mit der aktuellen Datenbank verknüpft", "Für eine strukturierte Trainingswoche entwickelt"],
    sessionPreview: (focus) => `Eine strukturierte Einheit mit Fokus auf ${focus.toLowerCase()}, inklusive Aufwärmen, Hauptteil und Cool-down.`,
  },
  ru: {
    objective: {
      "Prise de masse": "Набор массы",
      "Perte de poids": "Снижение веса",
      Force: "Сила",
      Posture: "Осанка",
      Musculation: "Силовая тренировка",
      "Sèche": "Сушка",
      Forme: "Форма",
      Reprise: "Возвращение к тренировкам",
      Renforcement: "Укрепление",
      Cardio: "Кардио",
      "Mobilité": "Мобильность",
      "Athlétique": "Атлетика",
      Gainage: "Кор",
      Hypertrophie: "Гипертрофия",
      Hybride: "Гибрид",
    },
    level: { Débutant: "Начинающий", Intermédiaire: "Средний", Avancé: "Продвинутый", Avance: "Продвинутый", "Tous niveaux": "Все уровни" },
    location: { Domicile: "Дом", "Salle de sport": "Зал", "Domicile équipé": "Оборудованный дом", "Domicile ou salle": "Дом или зал", "Salle ou domicile equipe": "Зал или оборудованный дом" },
    programLine: (name, goal, sessions, duration) => `${name} — премиальная программа для цели «${goal.toLowerCase()}»: ${sessions || "несколько"} тренировок в неделю, до ${duration || 45} минут за занятие.`,
    benefit: (goal) => [`Понятная прогрессия для цели «${goal.toLowerCase()}»`, "Разминка, основной блок и заминка включены", "Упражнения связаны с текущей базой", "Подходит для структурированной тренировочной недели"],
    sessionPreview: (focus) => `Структурированная тренировка с фокусом на ${focus.toLowerCase()}: разминка, основной блок и заминка включены.`,
  },
  ar: {
    objective: {
      "Prise de masse": "زيادة الكتلة العضلية",
      "Perte de poids": "خسارة الوزن",
      Force: "القوة",
      Posture: "القوام",
      Musculation: "تمارين القوة",
      "Sèche": "التنشيف",
      Forme: "اللياقة",
      Reprise: "العودة للتدريب",
      Renforcement: "التقوية",
      Cardio: "الكارديو",
      "Mobilité": "الحركة",
      "Athlétique": "الأداء الرياضي",
      Gainage: "الجذع",
      Hypertrophie: "التضخيم",
      Hybride: "مختلط",
    },
    level: { Débutant: "مبتدئ", Intermédiaire: "متوسط", Avancé: "متقدم", Avance: "متقدم", "Tous niveaux": "كل المستويات" },
    location: { Domicile: "المنزل", "Salle de sport": "النادي الرياضي", "Domicile équipé": "منزل مجهز", "Domicile ou salle": "المنزل أو النادي", "Salle ou domicile equipe": "النادي أو منزل مجهز" },
    programLine: (name, goal, sessions, duration) => `${name} برنامج بريميوم لهدف ${goal} مع ${sessions || "عدة"} حصص أسبوعياً وحصص تصل إلى ${duration || 45} دقيقة.`,
    benefit: (goal) => [`تدرج واضح لهدف ${goal}`, "الإحماء والجزء الرئيسي والتهدئة مضمّنة", "التمارين مرتبطة بقاعدة البيانات الحالية", "مصمم لأسبوع تدريبي منظم"],
    sessionPreview: (focus) => `حصة منظمة تركز على ${focus} مع إحماء وجزء رئيسي وتهدئة.`,
  },
};

const COMMON_TITLE_REPLACEMENTS = {
  en: [
    [/Séance/gi, "Session"],
    [/Jambes/gi, "Legs"],
    [/Fessiers/gi, "Glutes"],
    [/Pectoraux/gi, "Chest"],
    [/Épaules|Epaules/gi, "Shoulders"],
    [/Triceps/gi, "Triceps"],
    [/Biceps/gi, "Biceps"],
    [/Dos/gi, "Back"],
    [/Bras/gi, "Arms"],
    [/Poussée/gi, "Push"],
    [/Tirage/gi, "Pull"],
    [/\bet\b/gi, "and"],
    [/Quadriceps/gi, "Quads"],
    [/Gainage/gi, "Core"],
    [/Posture/gi, "Posture"],
    [/Cardio/gi, "Cardio"],
    [/Corps complet/gi, "Full body"],
    [/Haut du corps/gi, "Upper body"],
    [/Bas du corps/gi, "Lower body"],
    [/Force/gi, "Strength"],
    [/Volume/gi, "Volume"],
    [/Mobilité/gi, "Mobility"],
    [/Récupération/gi, "Recovery"],
    [/Reprise/gi, "Return"],
    [/Douce/gi, "Gentle"],
    [/Maison/gi, "Home"],
    [/Complet/gi, "Complete"],
    [/débutant/gi, "beginner"],
  ],
  it: [
    [/Séance/gi, "Seduta"],
    [/Jambes/gi, "Gambe"],
    [/Fessiers/gi, "Glutei"],
    [/Pectoraux/gi, "Pettorali"],
    [/Épaules|Epaules/gi, "Spalle"],
    [/Dos/gi, "Schiena"],
    [/Bras/gi, "Braccia"],
    [/Poussée/gi, "Spinta"],
    [/Tirage/gi, "Trazione"],
    [/Gainage/gi, "Core"],
    [/Corps complet/gi, "Corpo completo"],
    [/Haut du corps/gi, "Parte alta"],
    [/Bas du corps/gi, "Parte bassa"],
    [/Force/gi, "Forza"],
    [/Mobilité/gi, "Mobilità"],
    [/Récupération/gi, "Recupero"],
    [/Reprise/gi, "Ripresa"],
    [/Maison/gi, "Casa"],
    [/débutant/gi, "principiante"],
  ],
  es: [
    [/Séance/gi, "Sesión"],
    [/Jambes/gi, "Piernas"],
    [/Fessiers/gi, "Glúteos"],
    [/Pectoraux/gi, "Pectorales"],
    [/Épaules|Epaules/gi, "Hombros"],
    [/Dos/gi, "Espalda"],
    [/Bras/gi, "Brazos"],
    [/Poussée/gi, "Empuje"],
    [/Tirage/gi, "Tracción"],
    [/Gainage/gi, "Core"],
    [/Corps complet/gi, "Cuerpo completo"],
    [/Haut du corps/gi, "Tren superior"],
    [/Bas du corps/gi, "Tren inferior"],
    [/Force/gi, "Fuerza"],
    [/Mobilité/gi, "Movilidad"],
    [/Récupération/gi, "Recuperación"],
    [/Reprise/gi, "Retomar"],
    [/Maison/gi, "Casa"],
    [/débutant/gi, "principiante"],
  ],
  de: [
    [/Séance/gi, "Einheit"],
    [/Jambes/gi, "Beine"],
    [/Fessiers/gi, "Gesäß"],
    [/Pectoraux/gi, "Brust"],
    [/Épaules|Epaules/gi, "Schultern"],
    [/Dos/gi, "Rücken"],
    [/Bras/gi, "Arme"],
    [/Poussée/gi, "Drücken"],
    [/Tirage/gi, "Ziehen"],
    [/Gainage/gi, "Core"],
    [/Corps complet/gi, "Ganzkörper"],
    [/Haut du corps/gi, "Oberkörper"],
    [/Bas du corps/gi, "Unterkörper"],
    [/Force/gi, "Kraft"],
    [/Mobilité/gi, "Mobilität"],
    [/Récupération/gi, "Regeneration"],
    [/Reprise/gi, "Wiedereinstieg"],
    [/Maison/gi, "Zuhause"],
    [/débutant/gi, "Anfänger"],
  ],
  ru: [
    [/Séance/gi, "Тренировка"],
    [/Jambes/gi, "Ноги"],
    [/Fessiers/gi, "Ягодицы"],
    [/Pectoraux/gi, "Грудь"],
    [/Épaules|Epaules/gi, "Плечи"],
    [/Dos/gi, "Спина"],
    [/Bras/gi, "Руки"],
    [/Poussée/gi, "Жим"],
    [/Tirage/gi, "Тяга"],
    [/Gainage/gi, "Кор"],
    [/Corps complet/gi, "Все тело"],
    [/Haut du corps/gi, "Верх тела"],
    [/Bas du corps/gi, "Низ тела"],
    [/Force/gi, "Сила"],
    [/Mobilité/gi, "Мобильность"],
    [/Récupération/gi, "Восстановление"],
    [/Reprise/gi, "Возврат"],
    [/Maison/gi, "Дом"],
    [/débutant/gi, "начинающий"],
  ],
  ar: [
    [/Séance/gi, "حصة"],
    [/Jambes/gi, "الأرجل"],
    [/Fessiers/gi, "الأرداف"],
    [/Pectoraux/gi, "الصدر"],
    [/Épaules|Epaules/gi, "الأكتاف"],
    [/Dos/gi, "الظهر"],
    [/Bras/gi, "الذراعان"],
    [/Poussée/gi, "الدفع"],
    [/Tirage/gi, "السحب"],
    [/Gainage/gi, "الجذع"],
    [/Corps complet/gi, "الجسم بالكامل"],
    [/Haut du corps/gi, "الجزء العلوي"],
    [/Bas du corps/gi, "الجزء السفلي"],
    [/Force/gi, "القوة"],
    [/Mobilité/gi, "الحركة"],
    [/Récupération/gi, "الاستشفاء"],
    [/Reprise/gi, "العودة"],
    [/Maison/gi, "المنزل"],
    [/débutant/gi, "مبتدئ"],
  ],
};

function translateTitle(value, lang) {
  if (lang === "fr") return value;
  let out = String(value || "");
  for (const [pattern, replacement] of COMMON_TITLE_REPLACEMENTS[lang] || []) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function term(table, value, lang) {
  if (lang === "fr") return value || "";
  return TERMS[lang]?.[table]?.[value] || value || "";
}

function translateFocus(focus, lang) {
  const list = Array.isArray(focus) ? focus : [];
  return list.map((item) => translateTitle(item, lang));
}

function programTranslations(program) {
  const name = program.name || program.nomProgramme || program.title || "Programme premium";
  const goalFr = program.objectif || program.goal || "Forme";
  const sessions = program.nbSeances || program.sessionsPerWeek || null;
  const duration = program.durationPerSessionMin || null;
  const levelFr = program.niveauSportif || program.level || "Tous niveaux";
  const locationFr = program.location || "Salle de sport";
  const benefitsFr = Array.isArray(program.benefits) && program.benefits.length
    ? program.benefits
    : ["Progression claire", "Échauffement, corps de séance et retour au calme inclus", "Exercices issus de la base actuelle", "Semaine structurée et facile à suivre"];

  return Object.fromEntries(LANGS.map((lang) => {
    if (lang === "fr") {
      const desc = program.shortDesc || program.cardDesc || program.recap || "";
      return [lang, {
        name,
        nomProgramme: name,
        title: name,
        objectif: goalFr,
        goal: goalFr,
        niveauSportif: levelFr,
        level: levelFr,
        location: locationFr,
        shortDesc: desc,
        cardDesc: program.cardDesc || desc,
        longDescription: program.longDescription || desc,
        recap: program.recap || desc,
        benefits: benefitsFr,
      }];
    }

    const goal = term("objective", goalFr, lang);
    const translatedName = translateTitle(name, lang);
    const desc = TERMS[lang].programLine(translatedName, goal, sessions, duration);
    return [lang, {
      name: translatedName,
      nomProgramme: translatedName,
      title: translatedName,
      objectif: goal,
      goal,
      niveauSportif: term("level", levelFr, lang),
      level: term("level", levelFr, lang),
      location: term("location", locationFr, lang),
      shortDesc: desc,
      cardDesc: desc,
      longDescription: desc,
      recap: desc,
      benefits: TERMS[lang].benefit(goal),
    }];
  }));
}

function translateSession(session) {
  const focusFr = Array.isArray(session.focus) && session.focus.length ? session.focus.join(" · ") : "travail principal";
  const previewFr =
    session.preview ||
    session.description ||
    `Une séance structurée autour de ${focusFr.toLowerCase()}, avec échauffement, corps de séance et retour au calme.`;
  return {
    ...session,
    translations: Object.fromEntries(LANGS.map((lang) => {
      const focus = translateFocus(session.focus, lang);
      const focusText = focus.join(" · ") || (lang === "fr" ? "travail principal" : "main work");
      if (lang === "fr") {
        return [lang, {
          title: session.title || session.name || "",
          name: session.name || session.title || "",
          focus: Array.isArray(session.focus) ? session.focus : [],
          preview: previewFr,
          description: session.description || previewFr,
        }];
      }
      const preview = TERMS[lang].sessionPreview(focusText);
      const title = translateTitle(session.title || session.name || "", lang);
      return [lang, {
        title,
        name: title,
        focus,
        preview,
        description: preview,
      }];
    })),
  };
}

async function main() {
  const commit = process.argv.includes("--commit");
  const snap = await db.collection("programmes").where("origine", "==", "premium").get();
  console.log(`> ${commit ? "Application" : "Dry-run"} i18n sur ${snap.size} programmes premium`);

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const sessions = Array.isArray(data.sessions) ? data.sessions.map(translateSession) : [];
    const translations = programTranslations(data);
    console.log(`- ${docSnap.id}: ${data.name || data.nomProgramme || docSnap.id}`);
    if (commit) {
      await docSnap.ref.set({
        translations,
        sessions,
        i18nUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  if (!commit) {
    console.log("\n-- DRY RUN -- aucune écriture. Relance avec --commit pour appliquer.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
