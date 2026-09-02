import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const languages = ["fr", "en", "de", "es", "it", "ru", "ar"];
const locales = Object.fromEntries(languages.map((language) => [
  language,
  JSON.parse(fs.readFileSync(path.join(root, `src/i18n/locales/${language}/common.json`), "utf8")),
]));
const reference = locales.fr.guidedTutorial;
const tourIds = Object.keys(reference?.tours || {});
const referenceStepCount = Object.values(reference?.tours || {}).reduce((sum, tour) => sum + Object.keys(tour.steps || {}).length, 0);

assert.equal(tourIds.length, 14, "The complete tutorial catalog must be localized");
assert.equal(referenceStepCount, 70, "The tutorial step catalog changed without updating the localization audit");
assert.ok(reference?.actions?.finish && reference?.actions?.next, "French tutorial actions are missing");

languages.forEach((language) => {
  const tutorial = locales[language]?.guidedTutorial || {};
  assert.ok(tutorial.actions?.finish && tutorial.actions?.next, `${language}: tutorial actions are missing`);
  assert.deepEqual(Object.keys(tutorial.tours || {}).sort(), [...tourIds].sort(), `${language}: tutorial catalog mismatch`);
  let total = 0;
  let localized = 0;
  tourIds.forEach((tourId) => {
    const sourceTour = reference.tours[tourId];
    const targetTour = tutorial.tours[tourId];
    assert.ok(String(targetTour?.label || "").trim(), `${language}.${tourId}: missing label`);
    const stepIds = Object.keys(sourceTour.steps || {});
    assert.deepEqual(Object.keys(targetTour?.steps || {}).sort(), stepIds.sort(), `${language}.${tourId}: step mismatch`);
    stepIds.forEach((stepId) => {
      ["title", "text"].forEach((field) => {
        const sourceValue = String(sourceTour.steps[stepId][field] || "").trim();
        const targetValue = String(targetTour.steps[stepId]?.[field] || "").trim();
        assert.ok(targetValue, `${language}.${tourId}.${stepId}.${field}: missing value`);
        total += 1;
        if (language === "fr" || targetValue !== sourceValue) localized += 1;
      });
    });
  });
  if (language !== "fr") assert.ok(localized / total > 0.94, `${language}: too many tutorial strings still use the French source`);
});

console.log(`Tutorial translation audit OK: ${tourIds.length} tutorials, ${referenceStepCount} steps and ${languages.length} languages.`);
