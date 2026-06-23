// src/App.jsx
import React, { Suspense, lazy } from "react";
import {
  Box,
} from "@chakra-ui/react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import "./i18n";

import { AuthProvider, useAuth } from "./AuthContext";
import Navbar from "./components/Navbar";
import { Footer } from "./components/Footer";
import LanguageRouteSync from "./components/LanguageRouteSync.jsx";
import AppLoading from "./components/ui/AppLoading.jsx";

import { ConsentProvider, useConsent } from "./consent/ConsentContext.jsx";

import SeoManager from "./components/SeoManager.jsx";
import { SEO_ROUTES } from "./seo/seoConfig.js";

const GeolocationBootstrap = lazy(() => import("./components/GeolocationBootstrap.jsx"));
const SunColorModeSync = lazy(() => import("./components/SunColorModeSync.jsx"));
const GuidedTutorial = lazy(() => import("./components/GuidedTutorial.jsx"));
const CookieConsentBanner = lazy(() => import("./components/CookieConsentBanner.jsx"));
const RouteAnalyticsListener = lazy(() => import("./components/RouteAnalyticsListener.jsx"));

// Route-level code splitting: les écrans lourds ne partent plus dans le bundle initial.
const HomePage = lazy(() => import("./components/HomePage.jsx"));
const AboutPage = lazy(() => import("./pages/AboutPage.jsx"));
const ContactPage = lazy(() => import("./pages/ContactPage.jsx"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage.jsx"));
const TermsOfServicePage = lazy(() => import("./pages/TermsOfServicePage.jsx"));
const SalesPolicyPage = lazy(() => import("./pages/SalesPolicyPage.jsx"));
const TikTokOAuthRelay = lazy(() => import("./pages/TikTokOAuthRelay.jsx"));
const PremiumPrograms = lazy(() => import("./pages/PremiumPrograms.jsx"));
const PlanProfessionnel = lazy(() => import("./pages/PlanProfessionnel.jsx"));
const SeoLandingPage = lazy(() => import("./pages/SeoLandingPage.jsx"));
const Checkout = lazy(() => import("./pages/Checkout.jsx"));
const AccountBilling = lazy(() => import("./pages/AccountBilling.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const CoachDashboard = lazy(() => import("./components/CoachDashboard.jsx"));
const ClubDashboard = lazy(() => import("./pages/ClubDashboard.jsx"));
const ClientDashboard = lazy(() => import("./components/Clientdashboard.jsx"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard.jsx"));
const ProfilePageClient = lazy(() => import("./pages/ProfilePageClient.jsx"));
const MyPrograms = lazy(() => import("./pages/MyPrograms.jsx"));
const Statistics = lazy(() => import("./pages/StatisticsPageClient.jsx"));
const SettingsPageClient = lazy(() => import("./pages/SettingsPageClient.jsx"));
const ClientNutritionPage = lazy(() => import("./pages/ClientNutritionPage.jsx"));
const CoachNutritionPage = lazy(() => import("./pages/CoachNutritionPage.jsx"));
const ProfilePageCoach = lazy(() => import("./pages/ProfilePageCoach.jsx"));
const SettingsPageCoach = lazy(() => import("./pages/SettingsPageCoach.jsx"));
const StatisticsPageCoach = lazy(() => import("./pages/StatisticsPageCoach.jsx"));
const ExerciseBank = lazy(() => import("./components/ExerciseBank.jsx"));
const ProgramsPage = lazy(() => import("./components/ProgramsPage.jsx"));
const ProgramView = lazy(() => import("./components/ProgramView.jsx"));
const ProgramBuilderPage = lazy(() => import("./components/ProgramBuilderPage.jsx"));
const AutoProgramQuestionnaire = lazy(() => import("./components/AutoProgramQuestionnaire.jsx"));
const AutoProgramPreview = lazy(() => import("./components/AutoProgramPreview.jsx"));
const Clients = lazy(() => import("./components/Clients.jsx"));
const SessionPlayer = lazy(() => import("./components/SessionPlayer.jsx"));
const ClientView = lazy(() => import("./components/ClientView.jsx"));
const NutritionAssessmentEditor = lazy(() => import("./components/NutritionAssessmentEditor.jsx"));
const FoodSurvey = lazy(() => import("./components/FoodSurvey.jsx"));
const NutritionRationPage = lazy(() => import("./components/NutritionRationPage.jsx"));
const NutritionMenuJournalierPage = lazy(() => import("./components/MenuJournalierFromRation.jsx"));
const Success = lazy(() => import("./pages/Success"));
const Cancel = lazy(() => import("./pages/Cancel"));
const AdminGeo = lazy(() => import("./pages/AdminGeo.jsx"));
const AdminClient = lazy(() => import("./pages/AdminClient.jsx"));
const AdminCoach = lazy(() => import("./pages/AdminCoach.jsx"));
const AdminSocialPublisher = lazy(() => import("./pages/AdminSocialPublisher.jsx"));

function LazyBackground({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

function IdleMount({ children, delay = 900 }) {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      return undefined;
    }

    let timeoutId = 0;
    let idleId = 0;
    const done = () => setReady(true);

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(done, { timeout: delay });
    } else {
      timeoutId = window.setTimeout(done, delay);
    }

    return () => {
      if (idleId && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [delay]);

  return ready ? children : null;
}

function loginRedirectFor(location) {
  const next = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

function LegacyClientDashboardRoute() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isNutritionLink = params.get("nutrition") === "1";
  params.delete("nutrition");
  const query = params.toString();
  const target = isNutritionLink ? "/nutrition" : "/user-dashboard";
  return <Navigate to={`${target}${query ? `?${query}` : ""}`} replace />;
}

/* -------------------- Gardes -------------------- */
function ProtectedRoute({ children }) {
  const { t } = useTranslation("common");
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading label={t("common.loading_space", "Chargement de votre espace...")} />;
  if (!user) return <Navigate to={loginRedirectFor(location)} replace />;
  return children;
}

function CoachActiveRoute({ children }) {
  const { t } = useTranslation("common");
  const { user, loading, isAdmin, hasCoachAccess } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading label={t("common.loading_space", "Chargement de votre espace...")} />;
  if (!user) return <Navigate to={loginRedirectFor(location)} replace />;

  // Admin : accès OK
  if (isAdmin) return children;

  // Uniquement coach
  if (user.role !== "coach") return <Navigate to="/" replace />;

  // ✅ ACCÈS COACH = PAYANT OU TRIAL ACTIF
  if (!hasCoachAccess) return <Navigate to="/plans/professionnel" replace />;

  return children;
}

function ClubRoute({ children }) {
  const { t } = useTranslation("common");
  const { user, loading, isAdmin, hasCoachAccess } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading label={t("club.loading", "Chargement de l'espace club...")} />;
  if (!user) return <Navigate to={loginRedirectFor(location)} replace />;
  if (isAdmin) return children;
  if (user.role !== "coach") return <Navigate to="/" replace />;
  if (!hasCoachAccess) return <Navigate to="/plans/professionnel" replace />;
  if (user.accountType !== "club_owner" && user.clubRole !== "owner") {
    return <Navigate to="/coach-dashboard" replace />;
  }
  return children;
}

function ModuleRoute({ module, children }) {
  const { t } = useTranslation("common");
  const { user, loading, isAdmin, hasCoachAccess } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading label={t("plans.checkingPackage", "Vérification de votre package...")} />;
  if (!user) return <Navigate to={loginRedirectFor(location)} replace />;
  if (isAdmin) return children;
  if (user.role !== "coach") return <Navigate to="/" replace />;
  if (!hasCoachAccess) return <Navigate to="/plans/professionnel" replace />;
  const modules = user.proAccess?.modules || user.modules || [];
  if (Array.isArray(modules) && modules.length && !modules.includes(module) && !modules.includes("club")) {
    return <Navigate to="/plans/professionnel" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const { t } = useTranslation("common");
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading label={t("admin.loading", "Chargement de l'administration...")} />;
  if (!user) return <Navigate to={loginRedirectFor(location)} replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

/**
 * ✅ routes "client" accessibles uniquement aux particuliers.
 */
function ClientOnlyRoute({ children }) {
  const { t } = useTranslation("common");
  const { user, loading, isAdmin, effectiveRole, hasCoachAccess } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading label={t("common.loading_space", "Chargement de votre espace...")} />;
  if (!user) return <Navigate to={loginRedirectFor(location)} replace />;

  // Admin : jamais sur l'espace client
  if (isAdmin) {
    return effectiveRole === "admin" ? (
      <Navigate to="/admin" replace />
    ) : (
      <Navigate to="/coach-dashboard" replace />
    );
  }

  // Coach : jamais sur l'espace client
  if (effectiveRole === "coach") {
    if (!hasCoachAccess) return <Navigate to="/plans/professionnel" replace />;
    if (user.accountType === "club_owner" || user.clubRole === "owner") {
      return <Navigate to="/club-dashboard" replace />;
    }
    return <Navigate to="/coach-dashboard" replace />;
  }

  // Seulement particulier
  if (user.role !== "particulier") return <Navigate to="/" replace />;

  return children;
}

/* -------------------- Home route -------------------- */
function HomeRoute() {
  const { user, loading, effectiveRole, isAdmin, hasCoachAccess } = useAuth();

  if (loading && !user) return <HomePage />;
  if (!user) return <HomePage />;

  if (isAdmin) {
    return effectiveRole === "admin" ? (
      <Navigate to="/admin" replace />
    ) : (
      <Navigate to="/coach-dashboard" replace />
    );
  }

  // ✅ Coach : s'il n'a pas l'accès (trial/payant), on l'envoie au paywall
  if (effectiveRole === "coach") {
    if (!hasCoachAccess) return <Navigate to="/plans/professionnel" replace />;
    if (user.accountType === "club_owner" || user.clubRole === "owner") {
      return <Navigate to="/club-dashboard" replace />;
    }
    return <Navigate to="/coach-dashboard" replace />;
  }

  if (user.role === "particulier")
    return <Navigate to="/user-dashboard" replace />;

  return <HomePage />;
}

/* -------------------- App content -------------------- */
function AppContent() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const footerRoutes = [
    ...Object.keys(SEO_ROUTES),
    "/plans/professionnel",
    "/checkout",
    "/success",
    "/cancel",
    "/payment-success",
    "/payment-cancel",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/sales-policy",
    "/login",
    "/register",
    "/settings",
    "/settings-coach",
    "/club-dashboard/settings",
  ];
  const showFooter = footerRoutes.some((route) =>
    route === "/"
      ? location.pathname === "/"
      : location.pathname === route || location.pathname.startsWith(`${route}/`)
  );

  const { prefs, loaded: consentLoaded } = useConsent();
  const { user, effectiveRole, isAdmin } = useAuth();
  const analyticsOn = !!prefs?.analytics || isAdmin || effectiveRole === "admin";
  const shouldTrackRoute = consentLoaded && (analyticsOn || !!user?.uid);

  return (
    <>
      <SeoManager />
      <LanguageRouteSync />

      <LazyBackground>
        <SunColorModeSync />
      </LazyBackground>
      {analyticsOn && (
        <IdleMount>
          <LazyBackground>
            <GeolocationBootstrap />
          </LazyBackground>
        </IdleMount>
      )}

      <Navbar />
      {user && (
        <IdleMount delay={1200}>
          <LazyBackground>
            <GuidedTutorial />
          </LazyBackground>
        </IdleMount>
      )}

      {shouldTrackRoute && (
        <IdleMount delay={500}>
          <LazyBackground>
            <RouteAnalyticsListener isAnalyticsOn={analyticsOn} consentLoaded={consentLoaded} />
          </LazyBackground>
        </IdleMount>
      )}

      <Box as="main" flex="1" minH="0">
        <Suspense fallback={<AppLoading label={t("common.loading_page", "Chargement de la page...")} />}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />

          {/* ✅ Alias "Tarifs" (ancienne page Tarifs.jsx) -> page premium */}
          <Route
            path="/tarifs"
            element={<Navigate to="/programmes-premium" replace />}
          />
          <Route
            path="/pricing"
            element={<Navigate to="/programmes-premium" replace />}
          />

          {/* Offres */}
          <Route path="/plans/professionnel" element={<PlanProfessionnel />} />
          <Route path="/client-dashboard" element={<LegacyClientDashboardRoute />} />
          <Route path="/:slug" element={<SeoLandingPage />} />

          {/* Paiement / Premium */}
          <Route
            path="/programmes-premium"
            element={
              <ProtectedRoute>
                <PremiumPrograms />
              </ProtectedRoute>
            }
          />
          <Route path="/checkout/:productId" element={<Checkout />} />

          {/* Retours Stripe */}
          <Route path="/success" element={<Success />} />
          <Route path="/programmes-premium/success" element={<Success />} />
          <Route path="/questionnaire/success" element={<Success />} />
          <Route path="/cancel" element={<Cancel />} />
          <Route path="/payment-success" element={<Success />} />
          <Route path="/payment-cancel" element={<Cancel />} />

          <Route
            path="/account/billing"
            element={
              <ProtectedRoute>
                <AccountBilling />
              </ProtectedRoute>
            }
          />

          {/* Légal */}
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/sales-policy" element={<SalesPolicyPage />} />
          <Route path="/oauth/tiktok/callback" element={<TikTokOAuthRelay />} />

          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Dashboards */}
          <Route
            path="/coach-dashboard"
            element={
              <CoachActiveRoute>
                <CoachDashboard />
              </CoachActiveRoute>
            }
          />
          <Route
            path="/club-dashboard/*"
            element={
              <ClubRoute>
                <ClubDashboard />
              </ClubRoute>
            }
          />
          <Route
            path="/user-dashboard"
            element={
              <ClientOnlyRoute>
                <ClientDashboard />
              </ClientOnlyRoute>
            }
          />

          {/* Profil Client (✅ particuliers seulement) */}
          <Route
            path="/profile"
            element={
              <ClientOnlyRoute>
                <ProfilePageClient />
              </ClientOnlyRoute>
            }
          />
          <Route
            path="/mes-programmes"
            element={
              <ClientOnlyRoute>
                <MyPrograms />
              </ClientOnlyRoute>
            }
          />
          <Route
            path="/nutrition"
            element={
              <ClientOnlyRoute>
                <ClientNutritionPage />
              </ClientOnlyRoute>
            }
          />
          <Route
            path="/statistiques"
            element={
              <ClientOnlyRoute>
                <Statistics />
              </ClientOnlyRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ClientOnlyRoute>
                <SettingsPageClient />
              </ClientOnlyRoute>
            }
          />

          {/* Profil Coach */}
          <Route
            path="/coach/profile"
            element={
              <CoachActiveRoute>
                <ProfilePageCoach />
              </CoachActiveRoute>
            }
          />
          <Route
            path="/settings-coach"
            element={
              <CoachActiveRoute>
                <SettingsPageCoach />
              </CoachActiveRoute>
            }
          />
          <Route
            path="/statistics-coach"
            element={
              <CoachActiveRoute>
                <StatisticsPageCoach />
              </CoachActiveRoute>
            }
          />
          <Route
            path="/nutrition-coach"
            element={
              <ModuleRoute module="nutrition">
                <CoachNutritionPage />
              </ModuleRoute>
            }
          />

          {/* Banque d’exercices */}
          <Route
            path="/exercise-bank"
            element={
              <ModuleRoute module="sport">
                <ExerciseBank onAdd={() => {}} />
              </ModuleRoute>
            }
          />

          {/* Builder */}
          <Route
            path="/exercise-bank/program-builder/:programId"
            element={
              <ModuleRoute module="sport">
                <ProgramBuilderPage />
              </ModuleRoute>
            }
          />
          <Route
            path="/clients/:clientId/programmes/:programId/program-builder"
            element={
              <ModuleRoute module="sport">
                <ProgramBuilderPage />
              </ModuleRoute>
            }
          />

          {/* Espace Coach */}
          <Route
            path="/clients"
            element={
              <CoachActiveRoute>
                <Clients />
              </CoachActiveRoute>
            }
          />
          <Route
            path="/clients/:clientId"
            element={
              <CoachActiveRoute>
                <ClientView />
              </CoachActiveRoute>
            }
          />

          {/* ✅ Nutrition */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId"
            element={
              <ModuleRoute module="nutrition">
                <NutritionAssessmentEditor />
              </ModuleRoute>
            }
          />

          {/* ✅ Enquête alimentaire */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId/food-survey"
            element={
              <ModuleRoute module="nutrition">
                <FoodSurvey />
              </ModuleRoute>
            }
          />

          {/* ✅ Ration (Pro / Auto) */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId/ration"
            element={
              <ModuleRoute module="nutrition">
                <NutritionRationPage />
              </ModuleRoute>
            }
          />

          {/* ✅ Menu journalier (CIQUAL) */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId/menu"
            element={
              <ModuleRoute module="nutrition">
                <NutritionMenuJournalierPage />
              </ModuleRoute>
            }
          />

          {/* Programmes */}
          <Route
            path="/programmes"
            element={
              <ModuleRoute module="sport">
                <ProgramsPage />
              </ModuleRoute>
            }
          />
          <Route
            path="/programmes/:id"
            element={
              <ModuleRoute module="sport">
                <ProgramView />
              </ModuleRoute>
            }
          />

          {/* Programme côté client */}
          <Route
            path="/clients/:clientId/programmes/:programId"
            element={
              <ProtectedRoute>
                <ProgramView />
              </ProtectedRoute>
            }
          />

          {/* Auto-programmes */}
          <Route
            path="/auto-program-preview/:programId"
            element={
              <ModuleRoute module="sport">
                <AutoProgramPreview />
              </ModuleRoute>
            }
          />
          <Route
            path="/auto-program-preview/:clientId/:programId"
            element={
              <ProtectedRoute>
                <AutoProgramPreview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients/:clientId/programmes-auto/:programId"
            element={
              <ProtectedRoute>
                <AutoProgramPreview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/auto-program-questionnaire"
            element={
              <ModuleRoute module="sport">
                <AutoProgramQuestionnaire />
              </ModuleRoute>
            }
          />
          <Route
            path="/questionnaire"
            element={
              <ProtectedRoute>
                <AutoProgramQuestionnaire />
              </ProtectedRoute>
            }
          />

          {/* Player */}
          <Route
            path="/programmes/:id/session/:sessionIndex/play"
            element={
              <ModuleRoute module="sport">
                <SessionPlayer />
              </ModuleRoute>
            }
          />
          <Route
            path="/clients/:clientId/programmes/:programId/session/:sessionIndex/play"
            element={
              <ProtectedRoute>
                <SessionPlayer />
              </ProtectedRoute>
            }
          />

          {/* ✅ Admin (routes propres) */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/geo"
            element={
              <AdminRoute>
                <AdminGeo />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/social-publisher"
            element={
              <AdminRoute>
                <AdminSocialPublisher />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/client/:id"
            element={
              <AdminRoute>
                <AdminClient />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/coach/:id"
            element={
              <AdminRoute>
                <AdminCoach />
              </AdminRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Box>

      {showFooter && <Footer />}

      <LazyBackground>
        <CookieConsentBanner />
      </LazyBackground>
    </>
  );
}

/* -------------------- Entrée -------------------- */
export default function App() {
  return (
    <AuthProvider>
      <ConsentProvider>
        <Box display="flex" flexDir="column" minH="100vh" layerStyle="appShell">
          <AppContent />
        </Box>
      </ConsentProvider>
    </AuthProvider>
  );
}
