import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const LANGS = ["en", "it", "es", "de", "ru", "ar"];
const SECTIONS = [
  "CiqualFoodPicker",
  "FoodSurvey",
  "MenuJournalierAuto",
  "MenuJournalierFromRation",
  "MenuJournalierManual",
  "NutritionAdviceSheetsPanel",
  "NutritionAssessmentEditor",
  "NutritionRationPage",
  "RationAutoGenerator",
  "RationManualEditor",
  "RationSpontaneeExcel",
  "CoachNutritionPage",
  "NutritionWorkflowBar",
  "ClientNutritionSharedSection",
  "nutritionAdviceSheets",
];
const ROOT_SECTIONS = [];

const BATCH_SEPARATOR = "\n###BYL_NUTRITION_TRANSLATION_SEPARATOR###\n";
const KEEP_VALUES = new Set([
  "",
  "OK",
  "CIQUAL",
  "PDF",
  "VPO",
  "NAP",
  "MB",
  "DEJ",
  "kg",
  "lb",
  "cm",
  "ft",
  "kcal",
  "Prot",
  "Lip",
  "Glu",
  "SUVIMAX",
  "BoostYourLife.coach",
  "100% whey",
  "Whey vegan",
  "Gainer",
  "Fortimel",
  "docData",
  "assessmentRef",
]);

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));

const writeJson = (relativePath, value) => {
  fs.writeFileSync(path.join(projectRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const shouldKeep = (value) => {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (KEEP_VALUES.has(trimmed)) return true;
  if (/^[-–—•·()\d\s:/.%+,&]+$/.test(trimmed)) return true;
  return false;
};

const protectPlaceholders = (text) => {
  const placeholders = [];
  const protectedText = text.replace(/\{\{[^}]+\}\}/g, (match) => {
    const token = `BYLPH${placeholders.length}TOKEN`;
    placeholders.push([token, match]);
    return token;
  });
  return { protectedText, placeholders };
};

const restorePlaceholders = (text, placeholders) => {
  let restored = text;
  placeholders.forEach(([token, value]) => {
    const looseToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split("").join("\\s*");
    restored = restored.replace(new RegExp(looseToken, "gi"), value);
  });
  return restored;
};

const parseGoogleTranslateResponse = (payload) =>
  (payload?.[0] || []).map((part) => part?.[0] || "").join("");

async function translateBatch(items, lang) {
  const protectedItems = items.map(protectPlaceholders);
  const joined = protectedItems.map((item) => item.protectedText).join(BATCH_SEPARATOR);
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=" +
    encodeURIComponent(lang) +
    "&dt=t&q=" +
    encodeURIComponent(joined);

  const res = await fetch(url, {
    headers: { "User-Agent": "BYL nutrition locale translation" },
  });

  if (!res.ok) throw new Error(`Translation request failed (${res.status})`);

  const translatedJoined = parseGoogleTranslateResponse(await res.json());
  const translated = translatedJoined.split(BATCH_SEPARATOR);

  if (translated.length !== items.length) {
    throw new Error(`Translation batch mismatch for ${lang}: expected ${items.length}, got ${translated.length}`);
  }

  return translated.map((text, index) =>
    restorePlaceholders(text.trim(), protectedItems[index].placeholders)
  );
}

const collectCandidates = (source, target, out) => {
  if (!isObject(source) || !isObject(target)) return;

  Object.entries(source).forEach(([key, sourceValue]) => {
    const targetValue = target[key];
    if (isObject(sourceValue) && isObject(targetValue)) {
      collectCandidates(sourceValue, targetValue, out);
      return;
    }

    if (
      typeof sourceValue === "string" &&
      targetValue === sourceValue &&
      !shouldKeep(sourceValue)
    ) {
      out.add(sourceValue);
    }
  });
};

const addMissingValues = (source, target) => {
  if (!isObject(source) || !isObject(target)) return 0;
  let added = 0;
  Object.entries(source).forEach(([key, sourceValue]) => {
    if (!(key in target)) {
      target[key] = structuredClone(sourceValue);
      added += 1;
      return;
    }
    if (isObject(sourceValue) && isObject(target[key])) {
      added += addMissingValues(sourceValue, target[key]);
    }
  });
  return added;
};

const applyTranslations = (source, target, dictionary) => {
  if (!isObject(source) || !isObject(target)) return 0;
  let changed = 0;

  Object.entries(source).forEach(([key, sourceValue]) => {
    const targetValue = target[key];
    if (isObject(sourceValue) && isObject(targetValue)) {
      changed += applyTranslations(sourceValue, targetValue, dictionary);
      return;
    }

    if (typeof sourceValue === "string" && targetValue === sourceValue && dictionary.has(sourceValue)) {
      target[key] = dictionary.get(sourceValue);
      changed += 1;
    }
  });

  return changed;
};

const makeBatches = (items, maxChars = 3000) => {
  const batches = [];
  let batch = [];
  let len = 0;
  items.forEach((item) => {
    const nextLen = len + item.length + BATCH_SEPARATOR.length;
    if (batch.length && nextLen > maxChars) {
      batches.push(batch);
      batch = [];
      len = 0;
    }
    batch.push(item);
    len += item.length + BATCH_SEPARATOR.length;
  });
  if (batch.length) batches.push(batch);
  return batches;
};

async function main() {
  const fr = readJson("src/i18n/locales/fr/common.json");

  for (const lang of LANGS) {
    const relativePath = `src/i18n/locales/${lang}/common.json`;
    const locale = readJson(relativePath);
    const candidates = new Set();
    let added = 0;

    SECTIONS.forEach((section) => {
      if (fr.auto?.[section] && !locale.auto?.[section]) {
        locale.auto = locale.auto || {};
        locale.auto[section] = {};
      }
      added += addMissingValues(fr.auto?.[section], locale.auto?.[section]);
      collectCandidates(fr.auto?.[section], locale.auto?.[section], candidates);
    });
    ROOT_SECTIONS.forEach((section) => {
      if (fr?.[section] && !locale?.[section]) locale[section] = {};
      added += addMissingValues(fr?.[section], locale?.[section]);
      collectCandidates(fr?.[section], locale?.[section], candidates);
    });

    const items = [...candidates].sort();
    if (!items.length) {
      if (added) writeJson(relativePath, locale);
      console.log(`${lang}: nothing to translate (${added} missing key(s) added)`);
      continue;
    }

    const dictionary = new Map();
    const batches = makeBatches(items);
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      console.log(`${lang}: batch ${index + 1}/${batches.length} (${batch.length})`);
      const translated = await translateBatch(batch, lang);
      batch.forEach((sourceValue, itemIndex) => {
        dictionary.set(sourceValue, translated[itemIndex] || sourceValue);
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    let changed = 0;
    SECTIONS.forEach((section) => {
      changed += applyTranslations(fr.auto?.[section], locale.auto?.[section], dictionary);
    });
    ROOT_SECTIONS.forEach((section) => {
      changed += applyTranslations(fr?.[section], locale?.[section], dictionary);
    });

    writeJson(relativePath, locale);
    console.log(`${lang}: added ${added} key(s), translated ${changed} value(s)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
