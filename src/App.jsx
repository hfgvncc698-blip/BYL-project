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
import {
  CLIENT_MOBILE_NAV_PATHS,
  CLUB_MOBILE_NAV_PREFIXES,
  COACH_MOBILE_NAV_PREFIXES,
} from "./components/mobileNavPaths.js";
import { Footer } from "./components/Footer";
import LanguageRouteSync from "./components/LanguageRouteSync.jsx";
import AppLoading from "./components/ui/AppLoading.jsx";

import { ConsentProvider, useConsent } from "./consent/ConsentContext.jsx";

import SeoManager from "./components/SeoManager.jsx";
import { SEO_ROUTES } from "./seo/seoConfig.js";

const backgroundLoaders = {
  GeolocationBootstrap: () => import("./components/GeolocationBootstrap.jsx"),
  GuidedTutorial: () => import("./components/GuidedTutorial.jsx"),
  CookieConsentBanner: () => import("./components/CookieConsentBanner.jsx"),
  RouteAnalyticsListener: () => import("./components/RouteAnalyticsListener.jsx"),
};

const routeLoaders = {
  HomePage: () => import("./components/HomePage.jsx"),
  AboutPage: () => import("./pages/AboutPage.jsx"),
  ContactPage: () => import("./pages/ContactPage.jsx"),
  PrivacyPolicyPage: () => import("./pages/PrivacyPolicyPage.jsx"),
  TermsOfServicePage: () => import("./pages/TermsOfServicePage.jsx"),
  SalesPolicyPage: () => import("./pages/SalesPolicyPage.jsx"),
  TikTokOAuthRelay: () => import("./pages/TikTokOAuthRelay.jsx"),
  PremiumPrograms: () => import("./pages/PremiumPrograms.jsx"),
  PlanProfessionnel: () => import("./pages/PlanProfessionnel.jsx"),
  SeoLandingPage: () => import("./pages/SeoLandingPage.jsx"),
  Checkout: () => import("./pages/Checkout.jsx"),
  AccountBilling: () => import("./pages/AccountBilling.jsx"),
  Login: () => import("./pages/Login.jsx"),
  Register: () => import("./pages/Register.jsx"),
  CoachDashboard: () => import("./components/CoachDashboard.jsx"),
  ClubDashboard: () => import("./pages/ClubDashboard.jsx"),
  ClientDashboard: () => import("./components/Clientdashboard.jsx"),
  AdminDashboard: () => import("./components/AdminDashboard.jsx"),
  ProfilePageClient: () => import("./pages/ProfilePageClient.jsx"),
  MyPrograms: () => import("./pages/MyPrograms.jsx"),
  Statistics: () => import("./pages/StatisticsPageClient.jsx"),
  SettingsPageClient: () => import("./pages/SettingsPageClient.jsx"),
  ClientNutritionPage: () => import("./pages/ClientNutritionPage.jsx"),
  CoachNutritionPage: () => import("./pages/CoachNutritionPage.jsx"),
  ProfilePageCoach: () => import("./pages/ProfilePageCoach.jsx"),
  SettingsPageCoach: () => import("./pages/SettingsPageCoach.jsx"),
  StatisticsPageCoach: () => import("./pages/StatisticsPageCoach.jsx"),
  ExerciseBank: () => import("./components/ExerciseBank.jsx"),
  ProgramsPage: () => import("./components/ProgramsPage.jsx"),
  ProgramView: () => import("./components/ProgramView.jsx"),
  ProgramBuilderPage: () => import("./components/ProgramBuilderPage.jsx"),
  AutoProgramQuestionnaire: () => import("./components/AutoProgramQuestionnaire.jsx"),
  AutoProgramPreview: () => import("./components/AutoProgramPreview.jsx"),
  Clients: () => import("./components/Clients.jsx"),
  SessionPlayer: () => import("./components/SessionPlayer.jsx"),
  ClientView: () => import("./components/ClientView.jsx"),
  NutritionAssessmentEditor: () => import("./components/NutritionAssessmentEditor.jsx"),
  FoodSurvey: () => import("./components/FoodSurvey.jsx"),
  NutritionRationPage: () => import("./components/NutritionRationPage.jsx"),
  NutritionMenuJournalierPage: () => import("./components/MenuJournalierFromRation.jsx"),
  Success: () => import("./pages/Success"),
  Cancel: () => import("./pages/Cancel"),
  AdminGeo: () => import("./pages/AdminGeo.jsx"),
  AdminClient: () => import("./pages/AdminClient.jsx"),
  AdminCoach: () => import("./pages/AdminCoach.jsx"),
  AdminSocialPublisher: () => import("./pages/AdminSocialPublisher.jsx"),
};

const lazyFrom = (loaders, key) => lazy(loaders[key]);

const GeolocationBootstrap = lazyFrom(backgroundLoaders, "GeolocationBootstrap");
const GuidedTutorial = lazyFrom(backgroundLoaders, "GuidedTutorial");
const CookieConsentBanner = lazyFrom(backgroundLoaders, "CookieConsentBanner");
const RouteAnalyticsListener = lazyFrom(backgroundLoaders, "RouteAnalyticsListener");
const ClientMobileNav = lazy(() => import("./components/ClientMobileNav.jsx"));
const CoachMobileNav = lazy(() => import("./components/CoachMobileNav.jsx"));
const ClubMobileNav = lazy(() => import("./components/ClubMobileNav.jsx"));

// Route-level code splitting: les écrans lourds ne partent plus dans le bundle initial.
const HomePage = lazyFrom(routeLoaders, "HomePage");
const AboutPage = lazyFrom(routeLoaders, "AboutPage");
const ContactPage = lazyFrom(routeLoaders, "ContactPage");
const PrivacyPolicyPage = lazyFrom(routeLoaders, "PrivacyPolicyPage");
const TermsOfServicePage = lazyFrom(routeLoaders, "TermsOfServicePage");
const SalesPolicyPage = lazyFrom(routeLoaders, "SalesPolicyPage");
const TikTokOAuthRelay = lazyFrom(routeLoaders, "TikTokOAuthRelay");
const PremiumPrograms = lazyFrom(routeLoaders, "PremiumPrograms");
const PlanProfessionnel = lazyFrom(routeLoaders, "PlanProfessionnel");
const SeoLandingPage = lazyFrom(routeLoaders, "SeoLandingPage");
const Checkout = lazyFrom(routeLoaders, "Checkout");
const AccountBilling = lazyFrom(routeLoaders, "AccountBilling");
const Login = lazyFrom(routeLoaders, "Login");
const Register = lazyFrom(routeLoaders, "Register");
const CoachDashboard = lazyFrom(routeLoaders, "CoachDashboard");
const ClubDashboard = lazyFrom(routeLoaders, "ClubDashboard");
const ClientDashboard = lazyFrom(routeLoaders, "ClientDashboard");
const AdminDashboard = lazyFrom(routeLoaders, "AdminDashboard");
const ProfilePageClient = lazyFrom(routeLoaders, "ProfilePageClient");
const MyPrograms = lazyFrom(routeLoaders, "MyPrograms");
const Statistics = lazyFrom(routeLoaders, "Statistics");
const SettingsPageClient = lazyFrom(routeLoaders, "SettingsPageClient");
const ClientNutritionPage = lazyFrom(routeLoaders, "ClientNutritionPage");
const CoachNutritionPage = lazyFrom(routeLoaders, "CoachNutritionPage");
const ProfilePageCoach = lazyFrom(routeLoaders, "ProfilePageCoach");
const SettingsPageCoach = lazyFrom(routeLoaders, "SettingsPageCoach");
const StatisticsPageCoach = lazyFrom(routeLoaders, "StatisticsPageCoach");
const ExerciseBank = lazyFrom(routeLoaders, "ExerciseBank");
const ProgramsPage = lazyFrom(routeLoaders, "ProgramsPage");
const ProgramView = lazyFrom(routeLoaders, "ProgramView");
const ProgramBuilderPage = lazyFrom(routeLoaders, "ProgramBuilderPage");
const AutoProgramQuestionnaire = lazyFrom(routeLoaders, "AutoProgramQuestionnaire");
const AutoProgramPreview = lazyFrom(routeLoaders, "AutoProgramPreview");
const Clients = lazyFrom(routeLoaders, "Clients");
const SessionPlayer = lazyFrom(routeLoaders, "SessionPlayer");
const ClientView = lazyFrom(routeLoaders, "ClientView");
const NutritionAssessmentEditor = lazyFrom(routeLoaders, "NutritionAssessmentEditor");
const FoodSurvey = lazyFrom(routeLoaders, "FoodSurvey");
const NutritionRationPage = lazyFrom(routeLoaders, "NutritionRationPage");
const NutritionMenuJournalierPage = lazyFrom(routeLoaders, "NutritionMenuJournalierPage");
const Success = lazyFrom(routeLoaders, "Success");
const Cancel = lazyFrom(routeLoaders, "Cancel");
const AdminGeo = lazyFrom(routeLoaders, "AdminGeo");
const AdminClient = lazyFrom(routeLoaders, "AdminClient");
const AdminCoach = lazyFrom(routeLoaders, "AdminCoach");
const AdminSocialPublisher = lazyFrom(routeLoaders, "AdminSocialPublisher");

const COACH_CORE_PRELOADS = [
  "CoachDashboard",
  "Clients",
  "ProgramsPage",
];
const CLIENT_CORE_PRELOADS = [
  "ClientDashboard",
  "MyPrograms",
];
const CLUB_CORE_PRELOADS = ["ClubDashboard", "Clients", "ProgramsPage", "CoachDashboard"];
const ADMIN_CORE_PRELOADS = ["AdminDashboard", "CoachDashboard", "Clients", "ProgramsPage", "AdminClient", "AdminCoach"];

function preloadModules(keys) {
  [...new Set(keys)].forEach((key) => {
    const loader = routeLoaders[key] || backgroundLoaders[key];
    loader?.().catch(() => {});
  });
}

function schedulePreload(keys, delay = 250) {
  if (typeof window === "undefined" || !keys.length) return undefined;
  const run = () => preloadModules(keys);

  if ("requestIdleCallback" in window) {
    const idleId = window.requestIdleCallback(run, { timeout: Math.max(800, delay + 500) });
    return () => window.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(run, delay);
  return () => window.clearTimeout(timeoutId);
}

function preloadKeysForContext({ pathname, user, effectiveRole, isAdmin }) {
  const keys = ["CookieConsentBanner"];
  const role = effectiveRole || user?.role;
  const hasSport = isAdmin || user?.proAccess?.modules?.includes?.("sport") || user?.modules?.includes?.("sport");
  const hasNutrition =
    isAdmin || user?.proAccess?.modules?.includes?.("nutrition") || user?.modules?.includes?.("nutrition");

  if (!user) {
    keys.push("HomePage", "Login", "Register", "PlanProfessionnel", "PremiumPrograms");
    return keys;
  }

  if (isAdmin || role === "admin") keys.push(...ADMIN_CORE_PRELOADS);
  if (role === "coach") keys.push(...COACH_CORE_PRELOADS);
  if (role === "particulier") keys.push(...CLIENT_CORE_PRELOADS);
  if (
    role === "club" ||
    user?.accountType === "club_owner" ||
    user?.clubRole === "owner" ||
    pathname.startsWith("/club-dashboard")
  ) {
    keys.push(...CLUB_CORE_PRELOADS);
  }

  if (hasNutrition && !pathname.startsWith("/coach-dashboard")) {
    keys.push("CoachNutritionPage", "NutritionAssessmentEditor", "FoodSurvey", "NutritionRationPage");
  }
  if (hasSport && !pathname.startsWith("/coach-dashboard")) {
    keys.push("ExerciseBank", "ProgramsPage");
  }

  if (pathname.startsWith("/clients")) {
    keys.push("ClientView", "ProgramView", "ProgramBuilderPage", "SessionPlayer", "NutritionAssessmentEditor");
  } else if (pathname.startsWith("/programmes")) {
    keys.push("ProgramView", "ProgramBuilderPage", "SessionPlayer", "AutoProgramPreview");
  } else if (pathname.startsWith("/coach-dashboard")) {
    keys.push("Clients", "ProgramsPage");
  } else if (pathname.startsWith("/user-dashboard") || pathname.startsWith("/mes-programmes")) {
    keys.push("MyPrograms", "ProgramView", "SessionPlayer", "ClientNutritionPage", "Statistics");
  } else if (pathname.startsWith("/admin")) {
    keys.push("AdminGeo", "AdminSocialPublisher");
  }

  return keys;
}

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
  const preloadModulesKey = Array.isArray(user?.modules) ? user.modules.join("|") : "";
  const preloadProModulesKey = Array.isArray(user?.proAccess?.modules) ? user.proAccess.modules.join("|") : "";
  const analyticsOn = !!prefs?.analytics || isAdmin || effectiveRole === "admin";
  const shouldTrackRoute = consentLoaded && (analyticsOn || !!user?.uid);
  const isSessionPlayerRoute =
    /^\/programmes\/[^/]+\/session\/[^/]+\/play(?:\/)?$/.test(location.pathname) ||
    /^\/clients\/[^/]+\/programmes\/[^/]+\/session\/[^/]+\/play(?:\/)?$/.test(location.pathname);
  const showClientMobileNav =
    user?.role === "particulier" &&
    !isSessionPlayerRoute &&
    CLIENT_MOBILE_NAV_PATHS.includes(location.pathname);
  const isProgramBuilderRoute =
    /^\/exercise-bank\/program-builder\/[^/]+(?:\/)?$/.test(location.pathname) ||
    /^\/clients\/[^/]+\/programmes\/[^/]+\/program-builder(?:\/)?$/.test(location.pathname);
  const showCoachMobileNav =
    (user?.role === "coach" || user?.role === "admin") &&
    !isSessionPlayerRoute &&
    !isProgramBuilderRoute &&
    COACH_MOBILE_NAV_PREFIXES.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
  const showClubMobileNav =
    (user?.role === "club" || user?.role === "admin") &&
    !isSessionPlayerRoute &&
    CLUB_MOBILE_NAV_PREFIXES.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
  const showBottomMobileNav = showClientMobileNav || showCoachMobileNav || showClubMobileNav;

  React.useEffect(() => {
    const keys = preloadKeysForContext({
      pathname: location.pathname,
      user,
      effectiveRole,
      isAdmin,
    });
    const delay = user ? 2800 : 1600;
    return schedulePreload(keys, delay);
  }, [
    effectiveRole,
    isAdmin,
    location.pathname,
    preloadModulesKey,
    preloadProModulesKey,
    user?.accountType,
    user?.clubRole,
    user?.role,
    user?.uid,
  ]);

  return (
    <>
      <SeoManager />
      <LanguageRouteSync />

      {analyticsOn && (
        <IdleMount>
          <LazyBackground>
            <GeolocationBootstrap />
          </LazyBackground>
        </IdleMount>
      )}

      {!isSessionPlayerRoute && <Navbar />}
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

      <Box as="main" flex="1" minH="0" pb={showBottomMobileNav ? { base: 24, md: 0 } : 0}>
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
      {showClientMobileNav ? (
        <LazyBackground>
          <ClientMobileNav />
        </LazyBackground>
      ) : null}
      {showCoachMobileNav ? (
        <LazyBackground>
          <CoachMobileNav />
        </LazyBackground>
      ) : null}
      {showClubMobileNav ? (
        <LazyBackground>
          <ClubMobileNav />
        </LazyBackground>
      ) : null}

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
