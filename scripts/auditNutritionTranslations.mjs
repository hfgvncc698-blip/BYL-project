import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import nutritionRecentTranslations, {
  NUTRITION_RECENT_TRANSLATION_LANGUAGES,
} from "../src/i18n/nutritionRecentTranslations.js";
import recentUiTranslations from "../src/i18n/recentUiTranslations.js";

const languages = ["fr", "en", "it", "es", "de", "ru", "ar"];
const components = [
  "RationAutoGenerator",
  "MenuJournalierAuto",
  "MenuJournalierFromRation",
  "NutritionRationPage",
  "NutritionAssessmentEditor",
  "ClientNutritionSection",
  "ClientNutritionDailyJournal",
];

const requiredCommonKeys = [
  "coachNutritionJournal.historyPeriod",
  "coachNutritionJournal.lastDays",
  "nutritionCoach.status.shared",
  "nutritionCoach.status.validated",
  "nutritionCoach.status.inProgress",
  "nutritionCoach.status.draft",
  "nutritionCoach.share.patient",
  "nutritionCoach.share.internal",
  "auto.ClientNutritionSection.nutrition_access_required",
  "auto.ClientNutritionSection.creation_impossible",
  "auto.ClientNutritionSection.impossible_de_creer_le_bilan",
  "coachNutritionJournal.coachFeedback",
  "coachNutritionJournal.coachFeedbackPlaceholder",
  "coachNutritionJournal.sendFeedback",
  "coachNutritionJournal.feedbackSaved",
  "coachNutritionJournal.readByClient",
  "clientNutritionJournal.editWhatIAte",
  "clientNutritionJournal.followedMyPlan",
  "clientNutritionJournal.weeklySummary",
  "clientNutritionJournal.loggedDays",
  "clientNutritionJournal.completeDays",
  "clientNutritionJournal.averageFollowUp",
  "clientNutritionJournal.feedbackDays",
  "clientNutritionJournal.coachFeedback",
  "clientNutritionJournal.unreadCoachFeedback",
  "clientNutritionJournal.viewCoachFeedback",
  "clientNutritionJournal.dayStatus.complete",
  "clientNutritionJournal.dayStatus.partial",
  "clientNutritionJournal.dayStatus.empty",
  "nutritionCoach.stats.mobilePatients",
  "nutritionCoach.stats.mobileAssessments",
  "nutritionCoach.stats.mobileFollowup",
  "nutritionCoach.searchResults",
  "messaging.openFull",
  "messaging.unread",
  "messaging.loadPrevious",
  "settings.email.save_timeout_description",
];

const placeholders = (value) =>
  [...String(value || "").matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)]
    .map((match) => match[1])
    .sort();

const relevantSourceFiles = [];
const collectRelevantSources = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectRelevantSources(filePath);
    else if (/\.(js|jsx)$/.test(entry.name) && /(Nutrition|nutrition|Messaging|messaging|EmailNotificationPreference)/.test(filePath)) {
      relevantSourceFiles.push(filePath);
    }
  }
};
collectRelevantSources("src");

const literalTranslationKeys = new Set();
for (const filePath of relevantSourceFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  for (const match of source.matchAll(/(?:\bt|i18n\.t)\(\s*["']([^"']+)["']/g)) {
    if (!match[1].includes("${")) literalTranslationKeys.add(match[1]);
  }
}

assert.deepEqual(
  [...NUTRITION_RECENT_TRANSLATION_LANGUAGES].sort(),
  [...languages].sort(),
  "The nutrition translation overlay must cover every supported language."
);

const referencedKeys = new Map();
for (const component of components) {
  const source = fs.readFileSync(`src/components/${component}.jsx`, "utf8");
  const regex = new RegExp(`auto\\.${component}\\.([a-zA-Z0-9_]+)`, "g");
  referencedKeys.set(component, new Set([...source.matchAll(regex)].map((match) => match[1])));
}

const valueAtPath = (source, path) =>
  path.split(".").reduce((value, segment) => value?.[segment], source);

const frenchBase = JSON.parse(fs.readFileSync("src/i18n/locales/fr/common.json", "utf8"));
const translatedValueAtPath = (language, base, path) =>
  valueAtPath(recentUiTranslations[language], path)
  ?? valueAtPath(nutritionRecentTranslations[language], path)
  ?? valueAtPath(base, path);

for (const language of languages) {
  const base = JSON.parse(fs.readFileSync(`src/i18n/locales/${language}/common.json`, "utf8"));
  const overlay = nutritionRecentTranslations[language];

  for (const [component, keys] of referencedKeys) {
    for (const key of keys) {
    const value = recentUiTranslations[language]?.auto?.[component]?.[key]
      ?? overlay?.auto?.[component]?.[key]
      ?? base?.auto?.[component]?.[key];
      assert.ok(String(value || "").trim(), `${language}: missing auto.${component}.${key}`);
    }
  }

  for (const [component, frenchEntries] of Object.entries(nutritionRecentTranslations.fr.auto)) {
    for (const [key, frenchValue] of Object.entries(frenchEntries)) {
      const translatedValue = overlay?.auto?.[component]?.[key];
      assert.ok(String(translatedValue || "").trim(), `${language}: missing recent auto.${component}.${key}`);
      assert.deepEqual(
        placeholders(translatedValue),
        placeholders(frenchValue),
        `${language}: placeholder mismatch in auto.${component}.${key}`
      );
    }
  }

  for (const [component, frenchEntries] of Object.entries(recentUiTranslations.fr.auto || {})) {
    for (const [key, frenchValue] of Object.entries(frenchEntries)) {
      const translatedValue = recentUiTranslations[language]?.auto?.[component]?.[key]
        ?? overlay?.auto?.[component]?.[key]
        ?? base?.auto?.[component]?.[key];
      assert.ok(String(translatedValue || "").trim(), `${language}: missing recent UI auto.${component}.${key}`);
      assert.deepEqual(
        placeholders(translatedValue),
        placeholders(frenchValue),
        `${language}: placeholder mismatch in recent UI auto.${component}.${key}`
      );
    }
  }


  for (const key of requiredCommonKeys) {
    const frenchValue = translatedValueAtPath("fr", frenchBase, key);
    const translatedValue = translatedValueAtPath(language, base, key);
    assert.ok(String(translatedValue || "").trim(), `${language}: missing ${key}`);
    assert.deepEqual(
      placeholders(translatedValue),
      placeholders(frenchValue),
      `${language}: placeholder mismatch in ${key}`
    );
  }

  for (const key of literalTranslationKeys) {
    const translatedValue = translatedValueAtPath(language, base, key);
    assert.ok(String(translatedValue || "").trim(), `${language}: missing referenced translation ${key}`);
  }
}

console.log(
  `Nutrition translation audit OK: ${languages.length} languages, ${relevantSourceFiles.length} files and ${literalTranslationKeys.size} referenced keys checked.`
);
