import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getLegalPageCopy } from "../src/pages/legalPageCopy.js";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));

const languages = ["fr", "en", "es", "de", "it", "ru", "ar"];
const nonFrench = languages.filter((lng) => lng !== "fr");
const resourceTranslationLanguages = ["es", "de", "it", "ru", "ar"];
const resourceSlugs = [
  "logiciel-coach-sportif",
  "application-coach-sportif",
  "logiciel-suivi-client-coach",
  "application-coaching-nutrition",
  "logiciel-nutritionniste",
  "logiciel-coach-sportif-nutrition",
  "logiciel-club-sport",
  "logiciel-salle-de-sport",
];

const footerKeys = [
  "about",
  "pricing",
  "contact",
  "privacy",
  "terms",
  "sales",
  "resources",
  "resourcesCoachSport",
  "resourcesCoachApp",
  "resourcesClientTracking",
  "resourcesNutrition",
  "resourcesNutritionist",
  "resourcesSportNutrition",
  "resourcesClub",
  "resourcesGym",
  "rights",
];

const publicPageKeys = {
  about: [
    "title",
    "intro",
    "mission.title",
    "mission.body",
    "features.title",
    "autonomy.title",
    "autonomy.body",
    "vision.title",
    "vision.body",
    "why.title",
    "cta",
  ],
  contact: [
    "title",
    "fields.name.label",
    "fields.email.label",
    "fields.message.label",
    "submit",
    "toast.success.title",
    "toast.error.title",
  ],
  plans: ["title", "checkingPackage"],
};

const frenchMarkers = [
  "Conditions générales d'utilisation",
  "Les présentes conditions encadrent",
  "Présentation du service",
  "Création de compte",
  "Vendeur et contact",
  "Offres et prix",
  "La commande devient effective",
  "Les paiements sont traités",
  "Données collectées",
  "Politique de confidentialité",
  "Politique de vente",
  "Merci de remplir",
];

function getNested(obj, dottedKey) {
  return dottedKey.split(".").reduce((acc, key) => acc?.[key], obj);
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
}

function assertNoFrenchMarkers(value, label) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of frenchMarkers) {
    assert.ok(!text.includes(marker), `${label} still contains French marker: ${marker}`);
  }
}

for (const lng of languages) {
  const locale = readJson(`src/i18n/locales/${lng}/common.json`);

  for (const key of footerKeys) {
    assertNonEmptyString(locale.footer?.[key], `${lng}.footer.${key}`);
  }

  for (const [section, keys] of Object.entries(publicPageKeys)) {
    for (const key of keys) {
      assertNonEmptyString(getNested(locale[section], key), `${lng}.${section}.${key}`);
    }
  }

  for (const page of ["privacy", "terms", "sales"]) {
    const copy = getLegalPageCopy(lng, page);
    assertNonEmptyString(copy.title, `${lng}.${page}.title`);
    assertNonEmptyString(copy.intro, `${lng}.${page}.intro`);
    assert.ok(Array.isArray(copy.sections) && copy.sections.length >= 10, `${lng}.${page} must have complete sections`);
  }
}

for (const lng of nonFrench) {
  const locale = readJson(`src/i18n/locales/${lng}/common.json`);
  assertNoFrenchMarkers(locale.footer, `${lng}.footer`);
  assertNoFrenchMarkers(locale.about, `${lng}.about`);
  assertNoFrenchMarkers(locale.contact, `${lng}.contact`);

  for (const page of ["privacy", "terms", "sales"]) {
    assertNoFrenchMarkers(getLegalPageCopy(lng, page), `${lng}.${page}`);
  }
}

const footerSource = read("src/components/Footer.jsx");
assert.ok(footerSource.includes("as={RouterLink}"), "Footer links must use React Router");
assert.ok(footerSource.includes("hrefFor(link.href)"), "Footer links must preserve the active language");

const i18nSource = read("src/i18n/index.js");
assert.ok(
  i18nSource.includes('order: ["querystring", "localStorage", "path", "navigator", "htmlTag"]'),
  "i18n detection must prefer query string and localStorage before path"
);

const routeSyncSource = read("src/components/LanguageRouteSync.jsx");
assert.ok(routeSyncSource.includes("localStorage.getItem(STORAGE_KEY)"), "Route sync must reuse stored language");

const seoLandingSource = read("src/pages/SeoLandingPage.jsx");
assert.ok(
  seoLandingSource.includes("RESOURCE_TRANSLATIONS[base]?.[slug]"),
  "SEO resource pages must use localized resource translations before falling back"
);
for (const lng of resourceTranslationLanguages) {
  assert.ok(seoLandingSource.includes(`  ${lng}: {`), `Resource pages must include ${lng} translations`);
  for (const slug of resourceSlugs) {
    assert.ok(
      new RegExp(`\\b${lng}: \\{[\\s\\S]*?"${slug}"`).test(seoLandingSource),
      `Resource pages must include ${lng} translation for ${slug}`
    );
  }
}

console.log("Footer i18n OK: footer pages, legal copy and language persistence checks passed.");
