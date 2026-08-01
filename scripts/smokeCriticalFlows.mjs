import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { getLegalPageCopy } from "../src/pages/legalPageCopy.js";
import { isSessionValidatedRecord } from "../src/utils/sessionCompletion.js";

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
    'path="/activate-account"',
    'path="/reset-password"',
    'path="/verify-email"',
    'path="/clients/:clientId/nutrition/:assessmentId/ration"',
    'path="/programmes/:id/session/:sessionIndex/play"',
  ].forEach((route) => assert.ok(app.includes(route), `Missing route ${route}`));
});

check("sport PDFs include localized exercise notes", () => {
  const programView = read("src/components/ProgramView.jsx");
  const autoPreview = read("src/components/AutoProgramPreview.jsx");
  const sportPdf = read("src/utils/sportProgramPdf.jsx");

  [programView, autoPreview].forEach((source) => {
    assert.ok(
      source.includes("notes: getExerciseNoteLines(resolved, pdfLang)") &&
        source.includes("notesLabel={L.notes}"),
      "Each sport PDF entry point must pass localized exercise notes to the PDF document"
    );
  });
  assert.ok(
    sportPdf.includes("const notes = Array.isArray(exercise.notes)") &&
      sportPdf.includes("styles.notesBox"),
    "The shared sport PDF renderer must display exercise notes"
  );
});

check("session performance history freezes actual values per completed set", () => {
  const player = read("src/components/SessionPlayer.jsx");
  assert.ok(
    player.includes("function captureCurrentSetPerformance()") &&
      player.includes("const completedSetKey = captureCurrentSetPerformance()"),
    "A set must be captured when the effort ends"
  );
  assert.ok(
    player.includes("stageCurrentSetPerformance(field, value)") &&
      player.includes("performedSetsRef.current.values()") &&
      player.includes("seedFollowingSetPerformance(exIndex, currentSet, currentSet + 1)"),
    "Live values must feed completion snapshots and become the starting point of the next set"
  );
  assert.ok(
    player.includes("finalizeCurrentSetRestPerformance()") &&
      player.includes("activeRestPerformance"),
    "Actual rest time must be finalized and survive session resume"
  );
  ["fr", "en", "es", "de", "it", "ru", "ar"].forEach((lang) => {
    const common = JSON.parse(read(`src/i18n/locales/${lang}/common.json`));
    [
      "currentSessionHistory",
      "pendingSessionValidation",
      "inProgress",
      "completedSetsAppearHere",
      "pendingValidation",
      "setN",
      "setRecorded",
    ].forEach((key) => {
      assert.ok(common.sessionPlayer?.[key], `Missing session-in-progress translation ${lang}.${key}`);
    });
  });
  assert.ok(
    player.includes("performanceDraftsRef.current = new Map()") &&
      player.includes("clearSessionResumeState(sessionResumeStorageKey)") &&
      !player.includes("performanceDrafts: Array.from(performanceDraftsRef.current.values())"),
    "Leaving an unfinished session must discard its provisional performance values"
  );
});

check("customer emails share the BoostYourLife visual system", () => {
  const app = read("src/App.jsx");
  const actionPage = read("src/pages/ActivateAccount.jsx");
  const brandedEmail = read("backend/utils/brandedEmail.js");
  const clientProfile = read("backend/routes/clientProfile.js");
  const payments = read("backend/routes/payments.js");
  const adminEmails = read("backend/routes/adminEmails.js");
  const clubs = read("backend/routes/clubs.js");
  const functionsIndex = read("functions/index.js");

  assert.ok(
    app.includes('path="/reset-password"') &&
      app.includes('path="/verify-email"') &&
      actionPage.includes("const RECOVERY_COPY") &&
      actionPage.includes("const EMAIL_VERIFICATION_COPY"),
    "Password recovery and email verification must use dedicated branded pages"
  );
  ["fr", "en", "es", "de", "it", "ru", "ar"].forEach((lang) => {
    assert.ok(
      brandedEmail.includes(`  ${lang}: {`) &&
        actionPage.includes(`  ${lang}: {`),
      `Password recovery email and page must include ${lang}`
    );
  });
  assert.ok(
    brandedEmail.includes("BoostYourLife.coach") &&
      brandedEmail.includes("background:#17213a") &&
      brandedEmail.includes("border-radius:20px"),
    "The shared backend email shell must preserve the approved brand design"
  );
  assert.ok(
    clientProfile.includes("sendBrandedPasswordReset") &&
      clientProfile.includes("sendBrandedEmailChangeVerification") &&
      payments.includes("sendBrandedPasswordReset") &&
      !clientProfile.includes("accounts:sendOobCode") &&
      !payments.includes("accounts:sendOobCode"),
    "Client and admin password resets must use the custom tracked SMTP flow"
  );
  assert.ok(
    adminEmails.includes("brandedEmailHtml") &&
      clubs.includes("brandedEmailHtml"),
    "Manual admin and nutrition emails must use the shared backend shell"
  );
  assert.ok(
    functionsIndex.includes("function buildBrandedEmailLayout") &&
      countMatches(functionsIndex, /buildBrandedEmailLayout\(\{/g) >= 5,
    "All automatic Cloud Function templates must use the common branded layout"
  );
});

check("coach invitations and self-registration stay distinct", () => {
  const app = read("src/App.jsx");
  const activationPage = read("src/pages/ActivateAccount.jsx");
  const authContext = read("src/AuthContext.jsx");
  const clubsRoute = read("backend/routes/clubs.js");
  const clientProfile = read("backend/routes/clientProfile.js");
  const functionsIndex = read("functions/index.js");

  assert.ok(
    app.includes('path="/activate-account"') &&
      app.includes('location.pathname === "/activate-account"'),
    "The account activation page must be public and excluded from normal navigation"
  );
  ["fr", "en", "es", "de", "it", "ru", "ar"].forEach((lang) => {
    assert.ok(
      clubsRoute.includes(`  ${lang}: {`) && activationPage.includes(`  ${lang}: {`),
      `Activation email and page copy must include ${lang}`
    );
  });
  assert.ok(
    clubsRoute.includes('accountCreationSource: "coach-created"') &&
      authContext.includes('accountCreationSource: "self-registration"'),
    "Coach-created invitations and direct registrations must keep distinct origins"
  );
  assert.ok(
    clubsRoute.includes("generateClientActivationLink") &&
      clubsRoute.includes('type: "accountActivation"') &&
      clubsRoute.includes('deliveryProvider: provider'),
    "Coach invitations must use the tracked custom activation flow"
  );
  assert.ok(
    clientProfile.includes('router.post("/activation-complete", requireFirebaseAuth') &&
      activationPage.includes('"sendWelcomeEmail"') &&
      functionsIndex.includes('claimLifecycleEmail(userRef, "welcome")'),
    "A completed activation must trigger the deduplicated welcome email"
  );
  assert.ok(
    authContext.includes("isRecentlyCreatedAccount") &&
      functionsIndex.includes('reason: "historical-account"') &&
      functionsIndex.includes("isRecentActivation"),
    "Historical accounts must never receive a first-login welcome email"
  );
  assert.ok(
    clientProfile.includes("scoreClientIdentityCandidate") &&
      clientProfile.includes("data.accountUid === auth.uid") &&
      authContext.includes('where("accountUid", "==", firebaseUser.uid)'),
    "Duplicate legacy client profiles must resolve to the account-linked profile"
  );
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

check("program generation and client data access are scoped", () => {
  const programsRoute = read("backend/routes/programs.js");
  const rules = read("firestore.rules");
  const clientCreation = read("src/components/ClientCreation.jsx");
  const clientDashboard = read("src/components/Clientdashboard.jsx");
  const adminDashboard = read("src/components/AdminDashboard.jsx");

  assert.ok(
    programsRoute.includes('router.post("/generate", requireFirebaseAuth'),
    "Program generation must require Firebase authentication"
  );
  assert.ok(
    programsRoute.includes("resolveGenerationScope(req, clientIdFromBody, firebaseUid)") &&
      programsRoute.includes("consumeGenerationQuota(req.auth.uid)"),
    "Program generation must validate ownership and enforce a per-user quota"
  );
  assert.ok(
    !rules.includes("allow list: if isAdmin() || isCoach();"),
    "Coaches must not be able to list every user account"
  );
  assert.ok(
    clientCreation.includes("clubId: base.clubId || clubId || null") &&
      !clientCreation.includes("clubId: base.clubId || user?.clubId"),
    "Personal clients must not inherit a coach club implicitly"
  );
  assert.ok(
    clientDashboard.includes("const quickItems = snap.docs.map") &&
      clientDashboard.includes("await runLimited("),
    "Client programs must render before bounded history enrichment"
  );
  assert.ok(
    adminDashboard.includes("const initialReads = {") &&
      adminDashboard.includes("setRefreshing(true)") &&
      adminDashboard.includes("Actualisation…"),
    "Admin data must load concurrently behind a visible progressive state"
  );
});

check("client account creation and identity resolution are fail-safe", () => {
  const clubsRoute = read("backend/routes/clubs.js");
  const clientProfileRoute = read("backend/routes/clientProfile.js");
  const clientCreation = read("src/components/ClientCreation.jsx");
  const nutritionPrefill = read("src/utils/nutritionPrefill.js");
  const functionsIndex = read("functions/index.js");
  const authContext = read("src/AuthContext.jsx");
  const clientProfile = read("src/pages/ProfilePageClient.jsx");
  const paymentSuccess = read("src/pages/Success.jsx");
  const firestoreRules = read("firestore.rules");

  assert.ok(
    clubsRoute.includes('router.post("/clients", requireFirebaseAuth') &&
      clubsRoute.includes("if (!assertClientManager(req, res, requester)) return"),
    "Client creation must require an authenticated professional account"
  );
  assert.ok(
    clubsRoute.includes("await batch.commit()") &&
      clubsRoute.includes("await admin.auth().deleteUser(uid)") &&
      clubsRoute.includes("passwordSetupRequired: true"),
    "Auth and Firestore client creation must be atomic with rollback and password setup tracking"
  );
  assert.ok(
    clubsRoute.includes('router.get("/client-lookup", requireFirebaseAuth') &&
      clubsRoute.includes('router.post("/link-existing-client", requireFirebaseAuth'),
    "Client lookup and linking must remain authenticated"
  );
  assert.ok(
    clientCreation.includes('apiFetch("/clubs/clients"') &&
      !clientCreation.includes("createUserWithEmailAndPassword") &&
      !clientCreation.includes("sendPasswordResetEmail"),
    "Sport client creation must use the audited server endpoint"
  );
  assert.ok(
    nutritionPrefill.includes('apiFetch("/clubs/clients"') &&
      !nutritionPrefill.includes("createUserWithEmailAndPassword") &&
      !nutritionPrefill.includes("sendPasswordResetEmail"),
    "Nutrition client creation must use the same audited server endpoint"
  );
  assert.ok(
    clientProfileRoute.includes("resolvedBy: \"linkedClientId\"") &&
      clientProfileRoute.includes('error: "client-profile-ambiguous"'),
    "Client identity must prefer the explicit link and block ambiguous legacy emails"
  );
  assert.ok(
    functionsIndex.includes('throw new HttpsError("unauthenticated", "Authentification requise.")') &&
      functionsIndex.includes("Création de client non autorisée."),
    "Legacy password setup callable must reject anonymous and non-professional callers"
  );
  assert.ok(
    authContext.includes("await syncAccountLanguage(data)") &&
      authContext.includes('localStorage.setItem("i18nextLng", langCode)'),
    "The client account language must be applied immediately after login"
  );
  assert.ok(
    authContext.includes("const registrationBatch = writeBatch(db)") &&
      authContext.includes('doc(db, "clients", fbUser.uid)') &&
      authContext.includes("await deleteUser(createdUser)") &&
      authContext.includes("throw err"),
    "Public registration must atomically create the client profile, clean orphan Auth users and propagate failures"
  );
  assert.ok(
    clientProfile.includes('/client-profile/email-change-verification') &&
      clientProfile.includes("resolveClientSnapshotForUser") &&
      !clientProfile.includes("sendPasswordResetEmail") &&
      !clientProfile.includes("http://localhost:5173/login?from=email-change"),
    "Client email changes must be verified and legacy client profiles must use safe identity resolution"
  );
  assert.ok(
    paymentSuccess.includes("resolveClientSnapshotForUser") &&
      paymentSuccess.includes("collection(db, \"clients\", clientSnap.id, \"programmes\")"),
    "Program checkout must resolve the real client document before reading generated programs"
  );
  assert.ok(
    firestoreRules.includes("function safeSelfUserCreate") &&
      firestoreRules.includes('data.role in ["particulier", "coach"]') &&
      firestoreRules.includes('data.subscriptionStatus == "trialing"') &&
      firestoreRules.includes('duration.value(30, "d")'),
    "Self registration rules must reject admin roles, paid flags and unbounded trials"
  );
});

check("session completion is consistent across client views", () => {
  assert.equal(
    isSessionValidatedRecord({
      status: "validée",
      isPartial: false,
      pourcentageTermine: 35,
    }),
    true,
    "A session explicitly finished by the user must count below 90%"
  );
  assert.equal(
    isSessionValidatedRecord({
      status: "en_cours",
      isPartial: true,
      pourcentageTermine: 95,
    }),
    false,
    "Autosaved partial progress must not count as a completed session"
  );
  [
    "src/components/Clientdashboard.jsx",
    "src/pages/MyPrograms.jsx",
    "src/pages/StatisticsPageClient.jsx",
    "src/pages/StatisticsPageCoach.jsx",
  ].forEach((file) => {
    assert.ok(
      read(file).includes('from "../utils/sessionCompletion"') ||
        read(file).includes("from '../utils/sessionCompletion'"),
      `${file} must use the shared completion rule`
    );
  });
});

check("cloud functions source has a single toDate helper", () => {
  const functionsIndex = read("functions/index.js");
  assert.equal(countMatches(functionsIndex, /function toDate\(/g), 1, "functions/index.js must define toDate once");
});

check("admin email history is lazy and automatic sends are deduplicated", () => {
  const app = read("backend/app.js");
  const route = read("backend/routes/adminEmails.js");
  const clubsRoute = read("backend/routes/clubs.js");
  const paymentsRoute = read("backend/routes/payments.js");
  const clientProfileRoute = read("backend/routes/clientProfile.js");
  const tracking = read("backend/routes/emailTracking.js");
  const page = read("src/pages/AdminClient.jsx");
  const coachPage = read("src/pages/AdminCoach.jsx");
  const adminDashboard = read("src/components/AdminDashboard.jsx");
  const emailPanel = read("src/components/admin/AdminClientEmailPanel.jsx");
  const functionsIndex = read("functions/index.js");
  const authContext = read("src/AuthContext.jsx");

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
  assert.ok(
    globalEmailPage.includes("Éligible à partir du") &&
      globalEmailPage.includes("Traitement vers 09:00"),
    "Global email planning must explain the daily delivery window"
  );
  assert.ok(page.includes('lazyBehavior="keepMounted"'), "Admin tabs must preserve lazily loaded email state");
  assert.ok(functionsIndex.includes("async function claimLifecycleEmail"), "Automatic emails need an atomic claim");
  assert.ok(tracking.includes("firstOpenedAt"), "Email pixel must record the first open time");
  assert.ok(functionsIndex.includes("withEmailTrackingPixel"), "Automatic email HTML must include open tracking");
  assert.ok(
    clubsRoute.includes('source: "client-update"') &&
      clubsRoute.includes('type: "accountActivation"') &&
      paymentsRoute.includes('source: "admin-password-reset"'),
    "Client activation and admin password reset emails must create history events"
  );
  assert.ok(
    clientProfileRoute.includes('router.post("/password-reset"') &&
      clientProfileRoute.includes("allowPasswordResetAttempt") &&
      authContext.includes("/client-profile/password-reset") &&
      !authContext.includes("sendPasswordResetEmail"),
    "Self-service password resets must use the rate-limited tracked backend flow"
  );
  assert.ok(
    route.includes('"passwordReset"') &&
      route.includes("passwordResetEmailSentAt") &&
      authContext.includes("queueWelcomeEmail"),
    "Legacy password reset markers and first-login welcome emails must appear in admin history"
  );
  assert.ok(emailPanel.includes('["welcome", "Bienvenue"'), "Welcome email must be listed in admin preferences");
  [
    "Prochains e-mails prévus",
    "Éligible à partir du",
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
  assert.ok(
    functionsIndex.includes("function completedSessionIndex") &&
      functionsIndex.includes("if (index !== null) indexes.add(index)") &&
      functionsIndex.includes("return indexes.size"),
    "Program completion must count only unique, validated session indexes"
  );
  const completedSessionHelperSource = functionsIndex.match(
    /(function completedSessionIndex[\s\S]*?\n})\n\nasync function getCompletedSessionCount/
  )?.[1];
  assert.ok(completedSessionHelperSource, "Completed-session helper must remain testable");
  const completedSessionIndex = new Function(
    "safeTrim",
    `"use strict"; return (${completedSessionHelperSource});`
  )((value) => String(value || "").trim());
  assert.equal(
    completedSessionIndex(
      { status: "validée", isPartial: false, pourcentageTermine: 35, sessionIndex: 0 },
      3
    ),
    0,
    "Clicking Terminer la séance must validate the session even below 90%"
  );
  assert.equal(
    completedSessionIndex(
      { status: "en_cours", isPartial: true, pourcentageTermine: 95, sessionIndex: 0 },
      3
    ),
    null,
    "Partial progress must never validate a session"
  );
  assert.ok(
    functionsIndex.includes("const completedSessions = await getCompletedSessionCount(docSnap.ref, program)") &&
      functionsIndex.includes("completionEmailDueAt: admin.firestore.FieldValue.delete()"),
    "Scheduled completion emails must revalidate every session before sending"
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

check("program active weeks are editable and saved independently", () => {
  const builder = read("src/components/ProgramBuilder.jsx");
  assert.ok(
    builder.includes("const [programActiveWeeksInput, setProgramActiveWeeksInput]") &&
      builder.includes('if (rawValue === "") return'),
    "The active-weeks input must allow clearing and replacing the current value"
  );
  assert.ok(
    builder.includes("const saveRequest = updateDoc(programDocRef") &&
      builder.includes("durationWeeks: nextWeeks") &&
      builder.includes("setActiveWeeksDirty(false)"),
    "Active weeks must use a focused background save instead of rewriting the whole program"
  );
  assert.ok(
    builder.includes("return useMemo(() =>") &&
      builder.includes("[clientId, id, programId, programIdState]"),
    "The program document reference must stay stable between renders"
  );
  assert.ok(
    builder.includes("const PROGRAM_SAVE_TIMEOUT_MS = 5000") &&
      builder.includes("saveWithTimeout("),
    "Program saves must stop loading after a finite timeout"
  );
  assert.ok(
    builder.includes("!hasModifications && !activeWeeksDirty") &&
      builder.includes("Aucune nouvelle modification à enregistrer."),
    "Already-saved programs must not rewrite the full document"
  );
});

check("client search ignores accents", () => {
  const clients = read("src/components/Clients.jsx");
  assert.ok(
    clients.includes("const normalizeClientSearchText"),
    "Client search must normalize both the query and client names"
  );
  assert.ok(
    clients.includes('.normalize("NFD")') &&
      clients.includes('.replace(/[\\u0300-\\u036f]/g, "")'),
    "Client search must strip diacritical marks"
  );
  assert.ok(
    clients.includes("normalizeClientSearchText(searchQuery)") &&
      clients.includes("normalizeClientSearchText(`${c.prenom ?? \"\"} ${c.nom ?? \"\"}`)"),
    "Client search must compare normalized values"
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
    dashboard.includes("usedCachedDashboardData = true") &&
      dashboard.includes("shouldCompleteFullLoad = true") &&
      dashboard.includes("const backgroundRefresh = silent || usedCachedDashboardData"),
    "A cached dashboard must keep rendering immediately while a full silent refresh repairs incomplete planning data"
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
    dashboard.includes(
      "if (mergedEvents.length === 0 && (cachedDashboardData?.sessions || []).length > 0)"
    ),
    "An empty quick refresh must not erase reliable cached dashboard widgets"
  );
  assert.ok(
    dashboard.includes("preservedPlannedEvents") &&
      dashboard.includes("refreshedSourceIds") &&
      dashboard.includes("...preservedPlannedEvents"),
    "Quick session refreshes must retain cached planned sessions until the authoritative refresh completes"
  );
  assert.ok(
    dashboard.includes("const reviveDashboardPayload") &&
      dashboard.includes("const data = reviveDashboardPayload(memoryPayload.data)"),
    "In-memory dashboard cache dates must be revived before weekly widgets consume them"
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
  assert.ok(
    dashboard.includes("const resolveCoachAccessContext") &&
      dashboard.includes('getProPlanAccess(') &&
      dashboard.includes('isClubAccount ? "club" : "complete"'),
    "Admin coach preview must resolve active trial modules like a real coach login"
  );
  assert.ok(
    dashboard.includes("{hasNutritionCalendarAccess && (") &&
      dashboard.includes('t("auto.CoachDashboard.faire_une_ration", "Faire une ration")') &&
      dashboard.includes("onClick={() => rationShortcutModal.onOpen()}") &&
      dashboard.includes('data-testid="nutrition-plan-followup-shortcut"') &&
      dashboard.includes('onClick={() => openNutritionAppointmentForClient("")}') &&
      dashboard.includes(
        "`/clients/${entry.clientId}/nutrition/${entry.assessmentId}/ration`"
      ),
    "Nutrition-only dashboards must expose creation, ration and appointment planning as distinct actions"
  );
  assert.ok(
    dashboard.includes('params.get("adminPlan")') &&
      dashboard.includes('["sport", "nutrition", "complete"].includes(requestedAdminPlan)') &&
      dashboard.includes("&adminPlan=") &&
      dashboard.includes('role: "coach"'),
    "Admin plan previews must be explicit, bounded and preserved during navigation"
  );
  assert.ok(
    dashboard.includes("const isNutritionOnlyPatient = Boolean(nutritionRow && !hasSportProgram)") &&
      dashboard.includes('t("nutritionCoach.openAssessment", "Ouvrir le bilan")') &&
      dashboard.includes('t("dashboard.plan_nutrition_appointment", "Planifier un suivi")'),
    "Nutrition-only patient cards must replace sport session actions with nutrition actions"
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
