import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(root, "src/components/GuidedTutorial.jsx");
const localeRoot = path.join(root, "src/i18n/locales");
const languages = ["en", "de", "es", "it", "ru", "ar"];
const separator = "\n###BYL_TUTORIAL_TRANSLATION_SEPARATOR###\n";

const source = fs.readFileSync(sourceFile, "utf8");
const block = source.slice(source.indexOf("const TOURS = {"), source.indexOf("function isNutritionOnlyUser"));
const tourHeader = /^ {2}([a-zA-Z0-9_]+): \{/gm;
const headers = Array.from(block.matchAll(tourHeader));

const decodeJsString = (value) => JSON.parse(`"${value.replace(/\n/g, "\\n")}"`);
const tours = {};

headers.forEach((match, index) => {
  const id = match[1];
  const segment = block.slice(match.index, headers[index + 1]?.index ?? block.length);
  const labelMatch = segment.match(/\blabel:\s*"((?:\\.|[^"\\])*)"/);
  const steps = Array.from(segment.matchAll(/\btitle:\s*"((?:\\.|[^"\\])*)",\s*\n\s*text:\s*"((?:\\.|[^"\\])*)"/g))
    .map((step) => ({ title: decodeJsString(step[1]), text: decodeJsString(step[2]) }));
  if (!labelMatch || !steps.length) throw new Error(`Unable to extract tutorial ${id}`);
  tours[id] = { label: decodeJsString(labelMatch[1]), steps };
});

const sourceStrings = [];
Object.values(tours).forEach((tour) => {
  sourceStrings.push(tour.label);
  tour.steps.forEach((step) => sourceStrings.push(step.title, step.text));
});
sourceStrings.push("Terminer", "Suivant");

const makeBatches = (values, maxChars = 4200) => {
  const batches = [];
  let current = [];
  let size = 0;
  values.forEach((value) => {
    if (current.length && size + value.length + separator.length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(value);
    size += value.length + separator.length;
  });
  if (current.length) batches.push(current);
  return batches;
};

const translateBatch = async (items, language) => {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=" +
    encodeURIComponent(language) + "&dt=t&q=" + encodeURIComponent(items.join(separator));
  const response = await fetch(url, { headers: { "User-Agent": "BYL guided tutorial translator" } });
  if (!response.ok) throw new Error(`${language}: translation request failed (${response.status})`);
  const payload = await response.json();
  const translatedText = (payload?.[0] || []).map((part) => part?.[0] || "").join("");
  const translated = translatedText.split(separator).map((value) => value.trim());
  if (translated.length !== items.length) {
    throw new Error(`${language}: expected ${items.length} translations, received ${translated.length}`);
  }
  return translated;
};

const polishTranslation = (value, language) => {
  const rules = {
    en: [[/\bCustomers\b/g, "Clients"], [/\bCustomer\b/g, "Client"], [/\bcustomers\b/g, "clients"], [/\bcustomer\b/g, "client"], [/\bRation\b/g, "Meal plan"], [/\bration\b/g, "meal plan"]],
    de: [[/\bRation\b/g, "Ernährungsplan"], [/\bRationen\b/g, "Ernährungspläne"], [/der geteilten Ernährungsplan/g, "dem geteilten Ernährungsplan"]],
    es: [[/\bración\b/gi, "plan alimentario"], [/a la plan alimentario/g, "al plan alimentario"], [/una plan alimentario/g, "un plan alimentario"], [/la plan alimentario/g, "el plan alimentario"], [/plan alimentario compartida/g, "plan alimentario compartido"]],
    it: [[/\brazione\b/gi, "piano alimentare"], [/alla piano alimentare/g, "al piano alimentare"], [/una piano alimentare/g, "un piano alimentare"], [/la piano alimentare/g, "il piano alimentare"], [/piano alimentare condivisa/g, "piano alimentare condiviso"]],
    ar: [[/حصص الإعاشة|الحصص الغذائية/g, "الخطة الغذائية"], [/الحصص المشتركة/g, "الخطة الغذائية المشتركة"]],
  };
  return (rules[language] || []).reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
};

const manualTranslations = {
  "En attente du premier partage": {
    es: "En espera del primer contenido compartido",
    ru: "Ожидание первой публикации",
    ar: "في انتظار أول مشاركة",
  },
  "Si aucun contenu n’est encore disponible, cette zone vous l’indique. Le menu, la ration et le journal apparaîtront ici dès que votre professionnel aura partagé le suivi.": {
    de: "Wenn noch keine Inhalte verfügbar sind, wird dies in diesem Bereich angezeigt. Menü, Ernährungsplan und Ernährungstagebuch erscheinen hier, sobald Ihre Fachkraft den Ernährungsplan freigegeben hat.",
    it: "Se non è ancora disponibile alcun contenuto, quest’area te lo segnala. Il menu, il piano alimentare e il diario appariranno qui non appena il professionista avrà condiviso il percorso nutrizionale.",
    ru: "Если материалы ещё недоступны, это будет указано в данном разделе. Меню, план питания и дневник появятся здесь, как только специалист опубликует рекомендации по питанию.",
    ar: "إذا لم يتوفر أي محتوى بعد، فسيظهر ذلك في هذه المنطقة. ستظهر قائمة الوجبات والخطة الغذائية واليوميات هنا بمجرد أن يشارك المختص المتابعة الغذائية.",
  },
};

const translationsFor = async (language) => {
  const map = new Map();
  for (const batch of makeBatches(sourceStrings)) {
    const translated = await translateBatch(batch, language);
    batch.forEach((value, index) => map.set(value, polishTranslation(translated[index] || value, language)));
  }
  Object.entries(manualTranslations).forEach(([sourceValue, translations]) => {
    if (translations[language]) map.set(sourceValue, translations[language]);
  });
  return map;
};

const writeLocale = (language, dictionary) => {
  const file = path.join(localeRoot, language, "common.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.guidedTutorial = json.guidedTutorial || {};
  json.guidedTutorial.actions = {
    finish: dictionary?.get("Terminer") || "Terminer",
    next: dictionary?.get("Suivant") || "Suivant",
  };
  json.guidedTutorial.tours = Object.fromEntries(
    Object.entries(tours).map(([id, tour]) => [id, {
      label: dictionary?.get(tour.label) || tour.label,
      steps: Object.fromEntries(tour.steps.map((step, index) => [String(index), {
        title: dictionary?.get(step.title) || step.title,
        text: dictionary?.get(step.text) || step.text,
      }])),
    }])
  );
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
};

writeLocale("fr", null);
for (const language of languages) {
  const dictionary = await translationsFor(language);
  writeLocale(language, dictionary);
  console.log(`${language}: ${dictionary.size} tutorial strings translated`);
}
console.log(`ok - ${Object.keys(tours).length} tutorials localized in ${languages.length + 1} languages`);
