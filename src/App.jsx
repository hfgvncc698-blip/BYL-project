// src/App.jsx
import React, { Suspense, lazy } from "react";
import {
  Box,
} from "@chakra-ui/react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import "./i18n";

import { AuthProvider, useAuth } from "./AuthContext";
import Navbar from "./components/Navbar";
import { Footer } from "./components/Footer";
import LanguageRouteSync from "./components/LanguageRouteSync.jsx";
import AppLoading from "./components/ui/AppLoading.jsx";

import GeolocationBootstrap from "./components/GeolocationBootstrap.jsx";
import SunColorModeSync from "./components/SunColorModeSync.jsx";
import { ConsentProvider, useConsent } from "./consent/ConsentContext.jsx";
import CookieConsentBanner from "./components/CookieConsentBanner.jsx";

import RouteAnalyticsListener from "./components/RouteAnalyticsListener.jsx";

// Route-level code splitting: les écrans lourds ne partent plus dans le bundle initial.
const HomePage = lazy(() => import("./components/HomePage.jsx"));
const PlanProfessionnel = lazy(() => import("./pages/PlanProfessionnel.jsx"));
const PlanParticulier = lazy(() => import("./pages/PlanParticulier.jsx"));
const AboutPage = lazy(() => import("./pages/AboutPage.jsx"));
const ContactPage = lazy(() => import("./pages/ContactPage.jsx"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage.jsx"));
const TermsOfServicePage = lazy(() => import("./pages/TermsOfServicePage.jsx"));
const SalesPolicyPage = lazy(() => import("./pages/SalesPolicyPage.jsx"));
const PremiumPrograms = lazy(() => import("./pages/PremiumPrograms.jsx"));
const Checkout = lazy(() => import("./pages/Checkout.jsx"));
const AccountBilling = lazy(() => import("./pages/AccountBilling.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Register = lazy(() => import("./pages/Register.jsx"));
const CoachDashboard = lazy(() => import("./components/CoachDashboard.jsx"));
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

/* -------------------- Gardes -------------------- */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoading label="Chargement de votre espace..." />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function CoachActiveRoute({ children }) {
  const { user, loading, isAdmin, hasCoachAccess } = useAuth();
  if (loading) return <AppLoading label="Chargement de votre espace..." />;
  if (!user) return <Navigate to="/login" replace />;

  // Admin : accès OK
  if (isAdmin) return children;

  // Uniquement coach
  if (user.role !== "coach") return <Navigate to="/" replace />;

  // ✅ ACCÈS COACH = PAYANT OU TRIAL ACTIF
  if (!hasCoachAccess) return <Navigate to="/plans/professionnel" replace />;

  return children;
}

function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <AppLoading label="Chargement de l'administration..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

/**
 * ✅ routes "client" accessibles uniquement aux particuliers.
 */
function ClientOnlyRoute({ children }) {
  const { user, loading, isAdmin, effectiveRole, hasCoachAccess } = useAuth();
  if (loading) return <AppLoading label="Chargement de votre espace..." />;
  if (!user) return <Navigate to="/login" replace />;

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
    return <Navigate to="/coach-dashboard" replace />;
  }

  // Seulement particulier
  if (user.role !== "particulier") return <Navigate to="/" replace />;

  return children;
}

/* -------------------- Home route -------------------- */
function HomeRoute() {
  const { user, loading, effectiveRole, isAdmin, hasCoachAccess } = useAuth();

  if (loading) return <AppLoading label="Chargement..." />;
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
    return <Navigate to="/coach-dashboard" replace />;
  }

  if (user.role === "particulier")
    return <Navigate to="/user-dashboard" replace />;

  return <HomePage />;
}

/* -------------------- App content -------------------- */
function AppContent() {
  const location = useLocation();
  const footerRoutes = [
    "/",
    "/plans/professionnel",
    "/plans/particulier",
    "/programmes-premium",
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
  ];
  const showFooter = footerRoutes.some((route) =>
    route === "/"
      ? location.pathname === "/"
      : location.pathname === route || location.pathname.startsWith(`${route}/`)
  );

  const { prefs } = useConsent();
  const analyticsOn = !!prefs?.analytics;

  return (
    <>
      <LanguageRouteSync />

      <SunColorModeSync />
      <GeolocationBootstrap />

      <Navbar />

      <RouteAnalyticsListener isAnalyticsOn={analyticsOn} />

      <Box as="main" flex="1" minH="0">
        <Suspense fallback={<AppLoading label="Chargement de la page..." />}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />

          {/* ✅ Alias "Tarifs" (ancienne page Tarifs.jsx) -> Plan Pro */}
          <Route
            path="/tarifs"
            element={<Navigate to="/plans/professionnel" replace />}
          />
          <Route
            path="/pricing"
            element={<Navigate to="/plans/professionnel" replace />}
          />

          {/* Offres */}
          <Route path="/plans/professionnel" element={<PlanProfessionnel />} />
          <Route path="/plans/particulier" element={<PlanParticulier />} />

          {/* Paiement / Premium */}
          <Route path="/programmes-premium" element={<PremiumPrograms />} />
          <Route path="/checkout/:productId" element={<Checkout />} />

          {/* Retours Stripe */}
          <Route path="/success" element={<Success />} />
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
              <AdminRoute>
                <CoachNutritionPage />
              </AdminRoute>
            }
          />

          {/* Banque d’exercices */}
          <Route
            path="/exercise-bank"
            element={
              <CoachActiveRoute>
                <ExerciseBank onAdd={() => {}} />
              </CoachActiveRoute>
            }
          />

          {/* Builder */}
          <Route
            path="/exercise-bank/program-builder/:programId"
            element={
              <CoachActiveRoute>
                <ProgramBuilderPage />
              </CoachActiveRoute>
            }
          />
          <Route
            path="/clients/:clientId/programmes/:programId/program-builder"
            element={
              <CoachActiveRoute>
                <ProgramBuilderPage />
              </CoachActiveRoute>
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
              <AdminRoute>
                <NutritionAssessmentEditor />
              </AdminRoute>
            }
          />

          {/* ✅ Enquête alimentaire */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId/food-survey"
            element={
              <AdminRoute>
                <FoodSurvey />
              </AdminRoute>
            }
          />

          {/* ✅ Ration (Pro / Auto) */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId/ration"
            element={
              <AdminRoute>
                <NutritionRationPage />
              </AdminRoute>
            }
          />

          {/* ✅ Menu journalier (CIQUAL) */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId/menu"
            element={
              <AdminRoute>
                <NutritionMenuJournalierPage />
              </AdminRoute>
            }
          />

          {/* Programmes */}
          <Route
            path="/programmes"
            element={
              <CoachActiveRoute>
                <ProgramsPage />
              </CoachActiveRoute>
            }
          />
          <Route
            path="/programmes/:id"
            element={
              <CoachActiveRoute>
                <ProgramView />
              </CoachActiveRoute>
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
              <CoachActiveRoute>
                <AutoProgramPreview />
              </CoachActiveRoute>
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
              <CoachActiveRoute>
                <AutoProgramQuestionnaire />
              </CoachActiveRoute>
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
              <CoachActiveRoute>
                <SessionPlayer />
              </CoachActiveRoute>
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

      <CookieConsentBanner />
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
