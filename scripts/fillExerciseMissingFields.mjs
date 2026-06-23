import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const SOURCE_FILES = {
  warmup: { file: "warmup.json", rootKey: "echauffement" },
  training: { file: "training.json", rootKey: "exercices" },
  cooldown: { file: "cooldown.json", rootKey: "cooldown" },
  ergometre: { file: "ergometre.json", rootKey: null },
};

const LANGS = ["en", "es", "de", "it", "ru", "ar"];
const TRANSLATIONS_DIR = path.join(projectRoot, "exercise-translations");
const CONSIGNE_KEYS = ["Positionnement", "Mouvement", "Retour", "Respiration", "Posture"];

const args = new Set(process.argv.slice(2));
const shouldSyncFirestore = args.has("--firestore");
const syncChangedFromGit = args.has("--from-git");
const dryRun = args.has("--dry-run");

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const hasValue = (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasValue);
  if (isObject(value)) return Object.values(value).some(hasValue);
  return true;
};

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(projectRoot, file), "utf8"));
const writeJson = (file, value) => {
  if (dryRun) return;
  fs.writeFileSync(path.join(projectRoot, file), `${JSON.stringify(value, null, 2)}\n`);
};
const getExercises = (data, rootKey) => {
  if (Array.isArray(data)) return data;
  if (rootKey && Array.isArray(data[rootKey])) return data[rootKey];
  return Object.values(data).find(Array.isArray) || [];
};
const docIdForExercise = (exercise) => String(exercise.nom || exercise.name || exercise.id || "").replace(/\s+/g, "_");

const phrase = {
  genericMovement: {
    fr: "Exécuter le mouvement de façon fluide et contrôlée, en gardant une trajectoire stable.",
    en: "Perform the movement smoothly and under control, keeping a stable path.",
    es: "Ejecuta el movimiento de forma fluida y controlada, manteniendo una trayectoria estable.",
    de: "Führe die Bewegung flüssig und kontrolliert aus und halte die Bewegungslinie stabil.",
    it: "Esegui il movimento in modo fluido e controllato, mantenendo una traiettoria stabile.",
    ru: "Выполняйте движение плавно и подконтрольно, сохраняя стабильную траекторию.",
    ar: "نفذ الحركة بسلاسة وتحكم مع الحفاظ على مسار ثابت.",
  },
  genericReturn: {
    fr: "Revenir lentement à la position de départ en gardant le contrôle du mouvement.",
    en: "Return slowly to the starting position while keeping the movement controlled.",
    es: "Vuelve lentamente a la posición inicial manteniendo el control del movimiento.",
    de: "Kehre langsam in die Ausgangsposition zurück und behalte die Kontrolle.",
    it: "Torna lentamente alla posizione iniziale mantenendo il controllo del movimento.",
    ru: "Медленно вернитесь в исходное положение, сохраняя контроль движения.",
    ar: "عد ببطء إلى وضع البداية مع الحفاظ على التحكم في الحركة.",
  },
  genericBreathing: {
    fr: "Inspirer pendant la préparation ou la descente, expirer pendant l'effort.",
    en: "Inhale during the setup or lowering phase, exhale during the effort.",
    es: "Inhala durante la preparación o el descenso, exhala durante el esfuerzo.",
    de: "Atme während der Vorbereitung oder Abwärtsphase ein und während der Anstrengung aus.",
    it: "Inspira durante la preparazione o la discesa, espira durante lo sforzo.",
    ru: "Вдыхайте во время подготовки или опускания, выдыхайте во время усилия.",
    ar: "خذ شهيقا أثناء التحضير أو النزول، وازفر أثناء الجهد.",
  },
  genericPosture: {
    fr: "Garder le dos neutre, le regard stable et les abdominaux engagés.",
    en: "Keep a neutral back, steady gaze and engaged core.",
    es: "Mantén la espalda neutra, la mirada estable y el abdomen activo.",
    de: "Halte den Rücken neutral, den Blick stabil und die Körpermitte aktiv.",
    it: "Mantieni la schiena neutra, lo sguardo stabile e l'addome attivo.",
    ru: "Держите спину нейтральной, взгляд устойчивым, а мышцы корпуса активными.",
    ar: "حافظ على الظهر محايدا والنظر ثابتا وعضلات الجذع مشدودة.",
  },
  wallSitMovement: {
    fr: "Descendre jusqu'à former un angle d'environ 90° aux genoux, puis maintenir la position.",
    en: "Lower until the knees are at about a 90-degree angle, then hold the position.",
    es: "Baja hasta formar un ángulo de unos 90 grados en las rodillas y mantén la posición.",
    de: "Senke dich ab, bis die Knie etwa 90 Grad bilden, und halte die Position.",
    it: "Scendi fino a formare un angolo di circa 90 gradi alle ginocchia, poi mantieni la posizione.",
    ru: "Опуститесь до угла около 90 градусов в коленях и удерживайте положение.",
    ar: "انزل حتى تصبح الركبتان بزاوية تقارب 90 درجة ثم حافظ على الوضعية.",
  },
  wallSitReturn: {
    fr: "Pousser dans les talons pour revenir debout sans relâcher brutalement la posture.",
    en: "Push through the heels to stand back up without abruptly losing posture.",
    es: "Empuja con los talones para volver de pie sin perder bruscamente la postura.",
    de: "Drücke über die Fersen zurück in den Stand, ohne die Haltung abrupt zu lösen.",
    it: "Spingi sui talloni per tornare in piedi senza perdere bruscamente la postura.",
    ru: "Надавите пятками и вернитесь в стойку, не теряя резко положение тела.",
    ar: "ادفع عبر الكعبين للعودة إلى الوقوف دون فقدان الوضعية فجأة.",
  },
  deadliftBreathing: {
    fr: "Inspirer avant la descente, gainer, puis expirer en remontant la charge.",
    en: "Inhale before lowering, brace the core, then exhale as you lift the load.",
    es: "Inhala antes de bajar, activa el core y exhala al subir la carga.",
    de: "Atme vor dem Absenken ein, spanne die Mitte an und atme beim Heben aus.",
    it: "Inspira prima della discesa, attiva il core ed espira mentre sollevi il carico.",
    ru: "Вдохните перед опусканием, напрягите корпус и выдохните при подъеме веса.",
    ar: "خذ شهيقا قبل النزول، شد الجذع، ثم ازفر أثناء رفع الحمل.",
  },
  deadliftPosture: {
    fr: "Conserver le dos neutre, les épaules engagées et la charge proche du corps.",
    en: "Keep a neutral back, engaged shoulders and the load close to the body.",
    es: "Mantén la espalda neutra, los hombros activos y la carga cerca del cuerpo.",
    de: "Halte den Rücken neutral, die Schultern aktiv und die Last nah am Körper.",
    it: "Mantieni la schiena neutra, le spalle attive e il carico vicino al corpo.",
    ru: "Сохраняйте спину нейтральной, плечи активными, а вес близко к телу.",
    ar: "حافظ على الظهر محايدا والكتفين نشطين والحمل قريبا من الجسم.",
  },
  sledReturn: {
    fr: "Ralentir progressivement, replacer les appuis puis revenir au point de départ en contrôle.",
    en: "Slow down gradually, reset your footing and return to the start under control.",
    es: "Reduce la velocidad progresivamente, recoloca los apoyos y vuelve al inicio con control.",
    de: "Verlangsame allmählich, setze die Füße neu und kehre kontrolliert zum Start zurück.",
    it: "Rallenta gradualmente, riposiziona gli appoggi e torna al punto di partenza con controllo.",
    ru: "Постепенно замедлитесь, восстановите опору и подконтрольно вернитесь к старту.",
    ar: "خفف السرعة تدريجيا، أعد تثبيت القدمين ثم عد إلى نقطة البداية بتحكم.",
  },
  sledBreathing: {
    fr: "Respirer de manière rythmée et continue pendant toute la poussée ou traction.",
    en: "Breathe rhythmically and continuously throughout the push or pull.",
    es: "Respira de forma rítmica y continua durante todo el empuje o la tracción.",
    de: "Atme während des gesamten Schiebens oder Ziehens rhythmisch und kontinuierlich.",
    it: "Respira in modo ritmico e continuo durante tutta la spinta o trazione.",
    ru: "Дышите ритмично и непрерывно на протяжении всего толчка или тяги.",
    ar: "تنفس بإيقاع مستمر طوال الدفع أو السحب.",
  },
  sledPosture: {
    fr: "Garder le buste solide, les épaules basses et les appuis actifs.",
    en: "Keep the torso solid, shoulders low and foot contacts active.",
    es: "Mantén el tronco firme, los hombros bajos y los apoyos activos.",
    de: "Halte den Oberkörper stabil, die Schultern tief und die Schritte aktiv.",
    it: "Mantieni il busto stabile, le spalle basse e gli appoggi attivi.",
    ru: "Держите корпус устойчивым, плечи опущенными, а шаги активными.",
    ar: "حافظ على ثبات الجذع وانخفاض الكتفين ونشاط الارتكاز.",
  },
};

const termTranslations = {
  "Épaules": { en: "Shoulders", es: "Hombros", de: "Schultern", it: "Spalle", ru: "Плечи", ar: "الكتفان" },
  "Coudes": { en: "Elbows", es: "Codos", de: "Ellenbogen", it: "Gomiti", ru: "Локти", ar: "المرفقان" },
  "Poignets": { en: "Wrists", es: "Muñecas", de: "Handgelenke", it: "Polsi", ru: "Запястья", ar: "المعصمان" },
  "Chevilles": { en: "Ankles", es: "Tobillos", de: "Sprunggelenke", it: "Caviglie", ru: "Голеностопы", ar: "الكاحلان" },
  "Tendon d'Achille": { en: "Achilles tendon", es: "Tendón de Aquiles", de: "Achillessehne", it: "Tendine d'Achille", ru: "Ахиллово сухожилие", ar: "وتر أخيل" },
  "Tendon rotulien": { en: "Patellar tendon", es: "Tendón rotuliano", de: "Patellarsehne", it: "Tendine rotuleo", ru: "Сухожилие надколенника", ar: "وتر الرضفة" },
  "Tendon du deltoïde": { en: "Deltoid tendon", es: "Tendón del deltoides", de: "Deltasehne", it: "Tendine del deltoide", ru: "Сухожилие дельтовидной мышцы", ar: "وتر العضلة الدالية" },
  "Tendon du biceps": { en: "Biceps tendon", es: "Tendón del bíceps", de: "Bizepssehne", it: "Tendine del bicipite", ru: "Сухожилие бицепса", ar: "وتر العضلة ذات الرأسين" },
  "Exercice cardiovasculaire avec charge légère": {
    en: "Cardiovascular exercise with light load",
    es: "Ejercicio cardiovascular con carga ligera",
    de: "Kardiovaskuläre Übung mit leichter Last",
    it: "Esercizio cardiovascolare con carico leggero",
    ru: "Кардиоупражнение с легкой нагрузкой",
    ar: "تمرين قلبي مع حمل خفيف",
  },
  "Intermédiaire": { en: "Intermediate", es: "Intermedio", de: "Mittelstufe", it: "Intermedio", ru: "Средний уровень", ar: "متوسط" },
  "Tendons paravertébraux": { en: "Paraspinal tendons", es: "Tendones paravertebrales", de: "Paravertebrale Sehnen", it: "Tendini paravertebrali", ru: "Паравертебральные сухожилия", ar: "الأوتار جانب الفقرات" },
  "Tendons ischio-jambiers": { en: "Hamstring tendons", es: "Tendones isquiotibiales", de: "Ischiocrurale Sehnen", it: "Tendini ischiocrurali", ru: "Сухожилия задней поверхности бедра", ar: "أوتار العضلات الخلفية للفخذ" },
};

const translateValue = (value, lang) => {
  if (typeof value === "string") return termTranslations[value]?.[lang] || value;
  if (Array.isArray(value)) return value.map((item) => translateValue(item, lang));
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, translateValue(nested, lang)]));
  }
  return value;
};

function defaultConsignePatch(exercise) {
  const name = String(exercise.nom || "").toLowerCase();
  const patch = {};

  if (name.includes("chaise") || name.includes("wall sit")) {
    patch.Mouvement = phrase.wallSitMovement.fr;
    patch.Retour = phrase.wallSitReturn.fr;
    patch.Respiration = phrase.genericBreathing.fr;
    patch.Posture = phrase.genericPosture.fr;
  } else if (name.includes("deadlift") || name.includes("soulevé") || name.includes("rack pull")) {
    patch.Retour = phrase.genericReturn.fr;
    patch.Respiration = phrase.deadliftBreathing.fr;
    patch.Posture = phrase.deadliftPosture.fr;
  } else if (name.includes("sled") || name.includes("traîneau")) {
    patch.Retour = phrase.sledReturn.fr;
    patch.Respiration = phrase.sledBreathing.fr;
    patch.Posture = phrase.sledPosture.fr;
  } else {
    patch.Mouvement = phrase.genericMovement.fr;
    patch.Retour = phrase.genericReturn.fr;
    patch.Respiration = phrase.genericBreathing.fr;
    patch.Posture = phrase.genericPosture.fr;
  }

  return patch;
}

function translatedConsignePatch(exercise, lang) {
  const name = String(exercise.nom || "").toLowerCase();
  if (name.includes("chaise") || name.includes("wall sit")) {
    return {
      Mouvement: phrase.wallSitMovement[lang],
      Retour: phrase.wallSitReturn[lang],
      Respiration: phrase.genericBreathing[lang],
      Posture: phrase.genericPosture[lang],
    };
  }
  if (name.includes("deadlift") || name.includes("soulevé") || name.includes("rack pull")) {
    return {
      Retour: phrase.genericReturn[lang],
      Respiration: phrase.deadliftBreathing[lang],
      Posture: phrase.deadliftPosture[lang],
    };
  }
  if (name.includes("sled") || name.includes("traîneau")) {
    return {
      Retour: phrase.sledReturn[lang],
      Respiration: phrase.sledBreathing[lang],
      Posture: phrase.sledPosture[lang],
    };
  }
  return {
    Mouvement: phrase.genericMovement[lang],
    Retour: phrase.genericReturn[lang],
    Respiration: phrase.genericBreathing[lang],
    Posture: phrase.genericPosture[lang],
  };
}

function fieldPatchForExercise(exercise) {
  const patch = {};
  const name = String(exercise.nom || "");

  if (name === "Jumping Jacks lestés") {
    patch.articulations_solicitees = ["Épaules", "Coudes", "Poignets", "Chevilles"];
    patch.articulations_sollicitees = patch.articulations_solicitees;
    patch.tendons_solicites = ["Tendon d'Achille", "Tendon rotulien", "Tendon du deltoïde"];
    patch.tendons_sollicites = patch.tendons_solicites;
    patch.type = "Exercice cardiovasculaire avec charge légère";
    patch.niveau = "Intermédiaire";
  }

  if (name === "Stretching - Savasana (Posture du cadavre)") {
    patch.tendons_solicites = ["Tendons paravertébraux", "Tendons ischio-jambiers"];
    patch.tendons_sollicites = patch.tendons_solicites;
  }

  return patch;
}

function ensureTranslations(exercise, changedPatch) {
  exercise.translations = { ...(exercise.translations || {}) };
  LANGS.forEach((lang) => {
    const current = { ...(exercise.translations[lang] || {}) };
    const consignes = { ...(current.consignes || {}) };
    const defaultConsignes = translatedConsignePatch(exercise, lang);

    CONSIGNE_KEYS.forEach((key) => {
      if (!hasValue(consignes[key]) && hasValue(changedPatch.consignes?.[key])) {
        consignes[key] = defaultConsignes[key] || changedPatch.consignes[key];
      }
    });

    const translated = {
      ...current,
      consignes,
    };

    ["articulations_solicitees", "articulations_sollicitees", "tendons_solicites", "tendons_sollicites", "type", "niveau"].forEach((field) => {
      if (!hasValue(translated[field]) && hasValue(changedPatch[field])) {
        translated[field] = translateValue(changedPatch[field], lang);
      }
    });

    exercise.translations[lang] = translated;
  });
}

function completeExercise(exercise) {
  const changed = {};
  const consignes = { ...(exercise.consignes || {}) };
  const defaultConsignes = defaultConsignePatch(exercise);

  CONSIGNE_KEYS.forEach((key) => {
    if (!hasValue(consignes[key]) && hasValue(defaultConsignes[key])) {
      consignes[key] = defaultConsignes[key];
      changed.consignes = { ...(changed.consignes || {}), [key]: defaultConsignes[key] };
    }
  });

  if (changed.consignes) exercise.consignes = consignes;

  const fieldPatch = fieldPatchForExercise(exercise);
  Object.entries(fieldPatch).forEach(([key, value]) => {
    if (!hasValue(exercise[key])) {
      exercise[key] = value;
      changed[key] = value;
    }
  });

  if (Object.keys(changed).length > 0) ensureTranslations(exercise, changed);
  return changed;
}

function loadTranslationFile(collectionName, lang) {
  const file = path.join(TRANSLATIONS_DIR, `${collectionName}.${lang}.json`);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveTranslationFile(collectionName, lang, value) {
  if (dryRun) return;
  fs.mkdirSync(TRANSLATIONS_DIR, { recursive: true });
  fs.writeFileSync(path.join(TRANSLATIONS_DIR, `${collectionName}.${lang}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

const changedDocs = [];
const changedKeys = new Set();

const trackChangedDoc = (item) => {
  const key = `${item.collectionName}/${item.docId}`;
  if (changedKeys.has(key)) return;
  changedKeys.add(key);
  changedDocs.push(item);
};

for (const [collectionName, config] of Object.entries(SOURCE_FILES)) {
  const data = readJson(config.file);
  const exercises = getExercises(data, config.rootKey);
  const translationFiles = Object.fromEntries(LANGS.map((lang) => [lang, loadTranslationFile(collectionName, lang)]));
  let count = 0;

  exercises.forEach((exercise, index) => {
    const changed = completeExercise(exercise);
    if (!Object.keys(changed).length) return;

    const key = String(exercise.id || exercise.nom || exercise.name || `exercise_${index + 1}`);
    LANGS.forEach((lang) => {
      translationFiles[lang][key] = {
        ...(translationFiles[lang][key] || {}),
        ...(exercise.translations?.[lang] || {}),
      };
    });

    trackChangedDoc({
      collectionName,
      docId: docIdForExercise(exercise),
      changed,
      translations: exercise.translations || {},
    });
    count += 1;
  });

  if (count > 0) {
    writeJson(config.file, data);
    LANGS.forEach((lang) => saveTranslationFile(collectionName, lang, translationFiles[lang]));
  }
  console.log(`${collectionName}: ${count} exercice(s) complété(s)`);
}

if (syncChangedFromGit) {
  const syncFields = [
    "consignes",
    "articulations_solicitees",
    "articulations_sollicitees",
    "tendons_solicites",
    "tendons_sollicites",
    "type",
    "niveau",
  ];

  for (const [collectionName, config] of Object.entries(SOURCE_FILES)) {
    let previous;
    try {
      previous = JSON.parse(execFileSync("git", ["show", `HEAD:${config.file}`], {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }));
    } catch {
      continue;
    }

    const current = readJson(config.file);
    const previousByDocId = new Map(getExercises(previous, config.rootKey).map((exercise) => [docIdForExercise(exercise), exercise]));
    getExercises(current, config.rootKey).forEach((exercise) => {
      const docId = docIdForExercise(exercise);
      const before = previousByDocId.get(docId);
      if (!docId || !before) return;
      if (JSON.stringify(before) === JSON.stringify(exercise)) return;

      const changed = {};
      syncFields.forEach((field) => {
        if (hasValue(exercise[field])) changed[field] = exercise[field];
      });
      trackChangedDoc({
        collectionName,
        docId,
        changed,
        translations: exercise.translations || {},
      });
    });
  }
}

async function syncFirestore() {
  const bufferModule = require("buffer");
  if (!bufferModule.SlowBuffer) bufferModule.SlowBuffer = bufferModule.Buffer;

  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const fallbackFiles = [
      path.join(projectRoot, "backend", "serviceAccountKey.json"),
      path.join(projectRoot, "serviceAccountKey.json"),
      path.join(projectRoot, "boost-your-life-f6b3e-firebase-adminsdk-fbsvc-f200c38fb3.json"),
    ];

    if (explicit && fs.existsSync(explicit)) {
      admin.initializeApp({ credential: admin.credential.cert(require(explicit)) });
    } else {
      const fallback = fallbackFiles.find((file) => fs.existsSync(file));
      if (fallback) admin.initializeApp({ credential: admin.credential.cert(require(fallback)) });
      else admin.initializeApp();
    }
  }

  const db = admin.firestore();
  for (const item of changedDocs) {
    if (!item.docId) continue;
    const payload = {
      ...item.changed,
      translations: item.translations,
      status: "validated",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      validatedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedByMaintenance: true,
    };
    console.log(`${dryRun ? "Would sync" : "Syncing"} ${item.collectionName}/${item.docId}`);
    if (!dryRun) await db.collection(item.collectionName).doc(item.docId).set(payload, { merge: true });
  }
}

if (shouldSyncFirestore && changedDocs.length > 0) {
  await syncFirestore();
}

console.log(`${dryRun ? "Would update" : "Updated"} ${changedDocs.length} document(s).`);
