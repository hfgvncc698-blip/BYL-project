import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { getLegalPageCopy } from "../src/pages/legalPageCopy.js";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

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

check("critical app routes are registered", () => {
  const app = read("src/App.jsx");
  [
    'path="/plans/professionnel"',
    'path="/checkout/:productId"',
    'path="/club-dashboard/*"',
    'path="/clients/:clientId/nutrition/:assessmentId/ration"',
    'path="/programmes/:id/session/:sessionIndex/play"',
  ].forEach((route) => assert.ok(app.includes(route), `Missing route ${route}`));
});

check("contact form uses the shared API base", () => {
  const contact = read("src/pages/ContactPage.jsx");
  assert.ok(contact.includes('apiFetch("/contact"'), "Contact form must call /api/contact via apiFetch");
  assert.ok(!contact.includes('fetch(`${API_BASE}/contact`'), "Contact form still calls a raw /contact URL");
});

check("nutrition assessments are writable by assigned coaches", () => {
  const rules = read("firestore.rules");
  const nutritionBlock = rules.match(/match \/nutrition_assessments\/\{document=\*\*\} \{[\s\S]*?\n\s{6}\}/)?.[0] || "";
  assert.ok(nutritionBlock.includes("allow create, update, delete"), "Nutrition write rules are missing");
  assert.ok(nutritionBlock.includes("hasCoachAccess()"), "Nutrition writes must allow active coaches");
  assert.ok(nutritionBlock.includes("canAccessClient("), "Nutrition writes must be scoped to accessible clients");
});

check("stripe diagnostics are admin-only and do not expose key fragments", () => {
  const payments = read("backend/routes/payments.js");
  assert.ok(
    payments.includes('router.get("/_diag/stripe-key", requireAdminKey'),
    "Stripe key diagnostic route must require admin auth"
  );
  assert.ok(
    payments.includes('router.get("/_diag/echo", requireAdminKey'),
    "Diagnostic echo route must require admin auth"
  );
  const diagBlock = payments.match(/router\.get\("\/_diag\/stripe-key"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.ok(!diagBlock.includes("slice("), "Stripe diagnostic must not expose key fragments");
});

check("cloud functions source has a single toDate helper", () => {
  const functionsIndex = read("functions/index.js");
  assert.equal(countMatches(functionsIndex, /function toDate\(/g), 1, "functions/index.js must define toDate once");
});

check("legal pages are complete and dated", () => {
  [
    "src/pages/PrivacyPolicyPage.jsx",
    "src/pages/TermsOfServicePage.jsx",
    "src/pages/SalesPolicyPage.jsx",
  ].forEach((file) => {
    const page = read(file);
    assert.ok(!page.includes("le reste des sections"), `${file} still contains placeholder copy`);
  });
  const copy = read("src/pages/legalPageCopy.js");
  assert.ok(copy.includes("22 mai 2026"), "Legal copy must show the current update date");
  assert.ok(copy.includes("contact@boostyourlife.coach"), "Legal copy must expose the legal contact email");
  assert.ok(copy.includes("18 place des arcades, 06250 Mougins, France"), "Legal copy must expose the current business address");
  const renderer = read("src/pages/LegalDocumentPage.jsx");
  assert.ok(!renderer.includes("companyAddress"), "Legal address must not be rendered in every legal page footer");
  ["fr", "en", "it", "es", "de", "ru", "ar"].forEach((lng) => {
    assert.ok(copy.includes(`${lng},`) || copy.includes(`${lng} }`) || copy.includes(`${lng}:`), `Legal copy must include ${lng}`);
  });
  ["en", "it", "es", "de", "ru", "ar"].forEach((lng) => {
    const legal = JSON.stringify([
      getLegalPageCopy(lng, "privacy"),
      getLegalPageCopy(lng, "terms"),
      getLegalPageCopy(lng, "sales"),
    ]);
    [
      "Conditions générales d'utilisation",
      "Les présentes conditions encadrent",
      "Présentation du service",
      "Création de compte",
      "Vendeur et contact",
      "Offres et prix",
      "La commande devient effective",
      "Les paiements sont traités",
      "Données collectées",
    ].forEach((marker) => {
      assert.ok(!legal.includes(marker), `Legal pages for ${lng} still contain French marker: ${marker}`);
    });
  });
});

check("footer navigation preserves the selected language", () => {
  const i18nConfig = read("src/i18n/index.js");
  const footer = read("src/components/Footer.jsx");
  const routeSync = read("src/components/LanguageRouteSync.jsx");
  const seoLanding = read("src/pages/SeoLandingPage.jsx");

  assert.ok(
    i18nConfig.includes('order: ["querystring", "localStorage", "path", "navigator", "htmlTag"]'),
    "i18n detection must prefer query string and stored language before path detection"
  );
  assert.ok(footer.includes('as={RouterLink}'), "Footer links must use React Router navigation");
  assert.ok(footer.includes("hrefFor(link.href)"), "Footer links must preserve the active language in URLs");
  assert.ok(routeSync.includes('localStorage.getItem(STORAGE_KEY)'), "Route sync must reuse the stored language");
  assert.ok(
    seoLanding.includes("RESOURCE_TRANSLATIONS[base]?.[slug]"),
    "SEO footer landing pages must use localized resource translations before falling back"
  );
  for (const lng of resourceTranslationLanguages) {
    assert.ok(seoLanding.includes(`  ${lng}: {`), `SEO footer landing pages must include ${lng} translations`);
    for (const slug of resourceSlugs) {
      assert.ok(
        new RegExp(`\\b${lng}: \\{[\\s\\S]*?"${slug}"`).test(seoLanding),
        `SEO footer landing pages must include ${lng} translation for ${slug}`
      );
    }
  }
});

let passed = 0;
for (const item of checks) {
  try {
    item.fn();
    passed += 1;
    console.log(`ok - ${item.name}`);
  } catch (error) {
    console.error(`not ok - ${item.name}`);
    console.error(error?.message || error);
    process.exitCode = 1;
    break;
  }
}

if (!process.exitCode) {
  console.log(`Smoke tests OK: ${passed} critical checks passed.`);
}
