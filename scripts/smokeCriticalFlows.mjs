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
    'path="/admin/emails"',
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

check("admin email history is lazy and automatic sends are deduplicated", () => {
  const app = read("backend/app.js");
  const route = read("backend/routes/adminEmails.js");
  const tracking = read("backend/routes/emailTracking.js");
  const page = read("src/pages/AdminClient.jsx");
  const coachPage = read("src/pages/AdminCoach.jsx");
  const adminDashboard = read("src/components/AdminDashboard.jsx");
  const emailPanel = read("src/components/admin/AdminClientEmailPanel.jsx");
  const functionsIndex = read("functions/index.js");

  assert.ok(app.includes("app.use('/api/admin-emails', adminEmailRoutes)"), "Admin email API must be mounted");
  assert.ok(app.includes("app.use('/api/email-tracking', emailTrackingRoutes)"), "Email open tracking must be mounted");
  assert.ok(route.includes('router.use(requireAdmin)'), "Admin email API must require admin access");
  assert.ok(route.includes('duplicate-email-blocked'), "Manual email API must block duplicate requests");
  [
    'router.post("/client/:id/preview"',
    'router.post("/client/:id/test"',
    'router.post("/client/:id/retry/:eventId"',
    'router.post("/client/:id/upcoming/:scheduleId/cancel"',
    'router.patch("/client/:id/delivery"',
    'router.patch("/client/:id/templates/:type"',
    'router.get("/upcoming"',
    'router.post("/upcoming/:scheduleId/cancel"',
  ].forEach((endpoint) => assert.ok(route.includes(endpoint), `Missing email management endpoint: ${endpoint}`));
  assert.ok(route.includes('retry-only-after-failure'), "Retry must only be allowed after a failed send");
  assert.ok(route.includes('test-email-must-not-be-client'), "Test sends must never target the client");
  assert.ok(route.includes('email_admin_audit'), "Admin email actions must be audited");
  assert.ok(route.includes('permanent-bounce'), "Permanent SMTP bounces must suspend delivery");
  assert.ok(
    page.includes('lazy(() => import("../components/admin/AdminClientEmailPanel"))'),
    "Email management must be split into a lazy chunk"
  );
  assert.ok(
    coachPage.includes('lazy(() => import("../components/admin/AdminClientEmailPanel"))') &&
      coachPage.includes('<AdminClientEmailPanel profileId={id} audience={emailAudience} />'),
    "Coach and club-owner profiles must expose the shared email management panel"
  );
  assert.ok(
    adminDashboard.includes("E-mails du club") && adminDashboard.includes("?tab=emails"),
    "Club cards must provide direct access to the owner email panel"
  );
  const appSource = read("src/App.jsx");
  const globalEmailPage = read("src/pages/AdminEmails.jsx");
  assert.ok(appSource.includes('AdminEmails: () => import("./pages/AdminEmails.jsx")'), "Global admin email page must be lazy");
  assert.ok(appSource.includes('path="/admin/social-publisher" element={<Navigate to="/admin/emails" replace />}'), "Old Social Publisher route must redirect to global emails");
  assert.ok(globalEmailPage.includes("Ne pas envoyer"), "Global email planning must allow cancellation");
  assert.ok(globalEmailPage.includes("Date prévue"), "Global email planning must show scheduled dates");
  assert.ok(page.includes('lazyBehavior="keepMounted"'), "Admin tabs must preserve lazily loaded email state");
  assert.ok(functionsIndex.includes("async function claimLifecycleEmail"), "Automatic emails need an atomic claim");
  assert.ok(tracking.includes("firstOpenedAt"), "Email pixel must record the first open time");
  assert.ok(functionsIndex.includes("withEmailTrackingPixel"), "Automatic email HTML must include open tracking");
  assert.ok(emailPanel.includes('["welcome", "Bienvenue"'), "Welcome email must be listed in admin preferences");
  [
    "Prochains e-mails prévus",
    "Envoi prévu le",
    "Modèles automatiques",
    "Journal administrateur",
    "Échecs et rebonds",
    "Envoyer un test",
    "Restaurer l’origine",
  ].forEach((label) => assert.ok(emailPanel.includes(label), `Missing email UI control: ${label}`));
  assert.ok(
    functionsIndex.includes('claimLifecycleEmail(userRef, "welcome")'),
    "Welcome email must use the atomic duplicate guard"
  );
  assert.ok(
    functionsIndex.includes("hasLifecycleEmailCancellation(data, name)"),
    "Scheduled automatic emails must honor admin cancellations"
  );
  assert.ok(
    functionsIndex.includes("profile?.emailDelivery?.suspended === true"),
    "Automatic email sends must honor bounce suspension"
  );
  assert.ok(
    functionsIndex.includes("profile?.settings?.emailNotificationsEnabled === false"),
    "Automatic email sends must honor the account-wide notification preference"
  );
  assert.ok(
    functionsIndex.includes("if (!(await claimLifecycleEmail(programRef, kind))) return false"),
    "Program lifecycle emails must claim delivery before SMTP"
  );
});

check("email notifications can be disabled by clients, coaches and clubs", () => {
  const component = read("src/components/EmailNotificationPreferenceCard.jsx");
  const clientSettings = read("src/pages/SettingsPageClient.jsx");
  const coachSettings = read("src/pages/SettingsPageCoach.jsx");
  const clubSettings = read("src/pages/ClubDashboard.jsx");
  const adminEmails = read("backend/routes/adminEmails.js");

  const clientProfileApi = read("backend/routes/clientProfile.js");
  assert.ok(
    clientProfileApi.includes('"emailPreferences.allAutomatic": enabled'),
    "Preference must control all automatic emails"
  );
  assert.ok(
    component.includes('apiFetch("/client-profile/email-preferences"'),
    "Preference changes must use the authenticated API"
  );
  assert.ok(component.includes("SAVE_TIMEOUT_MS"), "Preference changes must have a finite timeout");
  assert.ok(
    clientProfileApi.includes('router.put("/email-preferences", requireFirebaseAuth'),
    "The preference API must require Firebase authentication"
  );
  assert.ok(
    clientProfileApi.includes('router.get("/email-preferences", requireFirebaseAuth'),
    "The saved preference must be read from the authenticated API"
  );
  assert.ok(clientProfileApi.includes("const batch = db.batch()"), "Account and client preferences must be saved atomically");
  assert.ok(clientProfileApi.includes("findLinkedClient"), "The API must synchronize the linked CRM profile");
  assert.ok(clientSettings.includes("<EmailNotificationPreferenceCard"), "Client settings must expose the email toggle");
  assert.ok(coachSettings.includes("<EmailNotificationPreferenceCard"), "Coach settings must expose the email toggle");
  assert.ok(clubSettings.includes("<EmailNotificationPreferenceCard"), "Club settings must expose the email toggle");
  assert.ok(
    adminEmails.includes("profile.user?.settings?.emailNotificationsEnabled === false"),
    "Global admin planning must exclude opted-out accounts"
  );
});

check("nutrition workflow uses the requested default modes", () => {
  const ration = read("src/components/NutritionRationPage.jsx");
  const menu = read("src/components/MenuJournalierFromRation.jsx");
  const survey = read("src/components/FoodSurvey.jsx");

  assert.ok(ration.includes('const DEFAULT_RATION_MODE = "auto"'), "Ration must default to automatic mode");
  assert.ok(
    ration.includes("const modeFromDoc = explicitMode || DEFAULT_RATION_MODE"),
    "Ration must keep an explicitly saved mode"
  );
  assert.ok(menu.includes("const DEFAULT_MENU_TAB = 1"), "Menu must default to the automatic tab");
  assert.ok(
    menu.includes("else setActiveTab(DEFAULT_MENU_TAB)"),
    "Menu fallback must not inherit the ration construction mode"
  );
  assert.ok(
    survey.includes('const DEFAULT_FOOD_SURVEY_MODE = "excel"'),
    "Food survey must default to simplified mode"
  );
  assert.ok(
    survey.includes('["excel", "ciqual"].includes(fs?.mode)'),
    "Food survey must keep a valid explicitly saved mode"
  );
});

check("coach session planning is atomic, bounded and duplicate-safe", () => {
  const app = read("backend/app.js");
  const route = read("backend/routes/coachSessions.js");
  const dashboard = read("src/components/CoachDashboard.jsx");
  const navbar = read("src/components/Navbar.jsx");

  assert.ok(
    app.includes("app.use('/api/coach-sessions', coachSessionRoutes)"),
    "Coach session API must be mounted"
  );
  assert.ok(
    route.includes("router.post(\"/\", requireFirebaseAuth"),
    "Coach session creation must require Firebase authentication"
  );
  assert.ok(route.includes("db.runTransaction"), "Session and calendar writes must be atomic");
  assert.ok(route.includes("crypto.createHash(\"sha256\")"), "Session retries must use a stable duplicate key");
  assert.ok(
    route.includes("transaction.create(sessionRef") && route.includes("transaction.create(calendarRef"),
    "Session and calendar documents must be created in the same transaction"
  );
  assert.ok(
    dashboard.includes('apiFetch("/coach-sessions"'),
    "The dashboard add button must use the authenticated session API"
  );
  assert.ok(dashboard.includes("sessionCreateSaving"), "The add button must expose a saving state");
  assert.ok(dashboard.includes("controller.abort()"), "Session creation must have a finite timeout");
  assert.ok(
    dashboard.includes("refreshCachedSessionWidgets(cachedDashboardData, loadSeq)"),
    "Cached dashboard returns must revalidate session widgets in the background"
  );
  assert.ok(
    dashboard.includes("mapRootSessionToQuickDashboardEvent"),
    "Cached session refreshes must rebuild dashboard calendar events"
  );
  assert.ok(
    dashboard.includes('if (endMs > 0 && endMs <= Date.now()) return "#DC2626"'),
    "Past unvalidated calendar sessions must use the missed color"
  );
  assert.ok(
    dashboard.includes("cachedPlannedBySourceId") &&
      dashboard.includes("normRating(cachedEvent.difficultyRating)"),
    "Quick session refreshes must preserve cached difficulty colors"
  );
  assert.ok(
    navbar.includes('nav("nav.new_appointment", "Nouveau rendez-vous")') &&
      navbar.includes("`${ROUTES.coachDashboard}?quickAction=plan`"),
    "The desktop New menu must expose appointment planning"
  );
  assert.ok(
    dashboard.includes("{...shortcutPrimaryButtonProps}") &&
      dashboard.includes('t("dashboard.plan_session", "Planifier une séance")'),
    "Session planning must remain the primary dashboard shortcut"
  );
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
