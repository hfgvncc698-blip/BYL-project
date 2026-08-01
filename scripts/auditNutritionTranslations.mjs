import assert from "node:assert/strict";
import fs from "node:fs";
import nutritionRecentTranslations, {
  NUTRITION_RECENT_TRANSLATION_LANGUAGES,
} from "../src/i18n/nutritionRecentTranslations.js";

const languages = ["fr", "en", "it", "es", "de", "ru", "ar"];
const components = [
  "RationAutoGenerator",
  "MenuJournalierAuto",
  "MenuJournalierFromRation",
  "NutritionRationPage",
];

const placeholders = (value) =>
  [...String(value || "").matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)]
    .map((match) => match[1])
    .sort();

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

for (const language of languages) {
  const base = JSON.parse(fs.readFileSync(`src/i18n/locales/${language}/common.json`, "utf8"));
  const overlay = nutritionRecentTranslations[language];

  for (const [component, keys] of referencedKeys) {
    for (const key of keys) {
      const value = overlay?.auto?.[component]?.[key] ?? base?.auto?.[component]?.[key];
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
}

console.log(
  `Nutrition translation audit OK: ${languages.length} languages and ${components.length} nutrition screens checked.`
);
