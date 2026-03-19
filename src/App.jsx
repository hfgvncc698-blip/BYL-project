// src/App.jsx
import React from "react";
import {
  ChakraProvider,
  ColorModeScript,
  extendTheme,
  Box,
} from "@chakra-ui/react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import "./i18n";

import { AuthProvider, useAuth } from "./AuthContext";
import Navbar from "./components/Navbar";
import { Footer } from "./components/Footer";
import LanguageRouteSync from "./components/LanguageRouteSync.jsx";

import GeolocationBootstrap from "./components/GeolocationBootstrap.jsx";
import SunColorModeSync from "./components/SunColorModeSync.jsx";
import { ConsentProvider, useConsent } from "./consent/ConsentContext.jsx";
import CookieConsentBanner from "./components/CookieConsentBanner.jsx";

import RouteAnalyticsListener from "./components/RouteAnalyticsListener.jsx";

// Pages publiques & Offres
import HomePage from "./components/HomePage.jsx";
import PlanProfessionnel from "./pages/PlanProfessionnel.jsx";
import PlanParticulier from "./pages/PlanParticulier.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import TermsOfServicePage from "./pages/TermsOfServicePage.jsx";
import SalesPolicyPage from "./pages/SalesPolicyPage.jsx";

// Paiement & Premium
import PremiumPrograms from "./pages/PremiumPrograms.jsx";
import Checkout from "./pages/Checkout.jsx";
import AccountBilling from "./pages/AccountBilling.jsx";

// Auth & Dashboards
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import CoachDashboard from "./components/CoachDashboard.jsx";
import ClientDashboard from "./components/Clientdashboard.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";

// Profil Client & Coach
import ProfilePageClient from "./pages/ProfilePageClient.jsx";
import MyPrograms from "./pages/MyPrograms.jsx";
import Statistics from "./pages/StatisticsPageClient.jsx";
import SettingsPageClient from "./pages/SettingsPageClient.jsx";
import ProfilePageCoach from "./pages/ProfilePageCoach.jsx";
import SettingsPageCoach from "./pages/SettingsPageCoach.jsx";
import StatisticsPageCoach from "./pages/StatisticsPageCoach.jsx";

// Fonctionnalités coach
import ExerciseBank from "./components/ExerciseBank.jsx";
import ProgramsPage from "./components/ProgramsPage.jsx";
import ProgramView from "./components/ProgramView.jsx";
import ProgramBuilderPage from "./components/ProgramBuilderPage.jsx";
import AutoProgramQuestionnaire from "./components/AutoProgramQuestionnaire.jsx";
import AutoProgramPreview from "./components/AutoProgramPreview.jsx";
import Clients from "./components/Clients.jsx";
import SessionPlayer from "./components/SessionPlayer.jsx";
import ClientView from "./components/ClientView.jsx";

// ✅ Nutrition
import NutritionAssessmentEditor from "./components/NutritionAssessmentEditor.jsx";
import FoodSurvey from "./components/FoodSurvey.jsx"; // ✅ Enquête alimentaire
import NutritionRationPage from "./components/NutritionRationPage.jsx"; // ✅ Page Ration (Pro / Auto)

// ✅ NOUVEAU : Menu journalier (CIQUAL) basé sur ration
import NutritionMenuJournalierPage from "./components/MenuJournalierFromRation.jsx";

// Paiement Stripe (pages retour)
import Success from "./pages/Success";
import Cancel from "./pages/Cancel";

// Admin
import AdminGeo from "./pages/AdminGeo.jsx";
import AdminClient from "./pages/AdminClient.jsx"; // ✅ client admin
import AdminCoach from "./pages/AdminCoach.jsx"; // ✅ coach admin

/* -------------------- Thème Chakra -------------------- */
const theme = extendTheme({
  config: { initialColorMode: "light", useSystemColorMode: false },
});

/* -------------------- Gardes -------------------- */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function CoachActiveRoute({ children }) {
  const { user, loading, isAdmin, hasCoachAccess } = useAuth();
  if (loading) return null;
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
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

/**
 * ✅ routes "client" accessibles uniquement aux particuliers.
 */
function ClientOnlyRoute({ children }) {
  const { user, loading, isAdmin, effectiveRole, hasCoachAccess } = useAuth();
  if (loading) return null;
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

  if (loading) return null;
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
  const noFooter = ["/login", "/register"].includes(location.pathname);

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

          {/* ✅ Nutrition (Admin only) */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId"
            element={
              <AdminRoute>
                <NutritionAssessmentEditor />
              </AdminRoute>
            }
          />

          {/* ✅ Enquête alimentaire (Admin only) */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId/food-survey"
            element={
              <AdminRoute>
                <FoodSurvey />
              </AdminRoute>
            }
          />

          {/* ✅ Ration (Pro / Auto) (Admin only) */}
          <Route
            path="/clients/:clientId/nutrition/:assessmentId/ration"
            element={
              <AdminRoute>
                <NutritionRationPage />
              </AdminRoute>
            }
          />

          {/* ✅ Menu journalier (CIQUAL) (Admin only) */}
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
      </Box>

      {!noFooter && <Footer />}

      <CookieConsentBanner />
    </>
  );
}

/* -------------------- Entrée -------------------- */
export default function App() {
  return (
    <AuthProvider>
      <ChakraProvider theme={theme}>
        <ConsentProvider>
          <ColorModeScript initialColorMode="light" />
          <Box display="flex" flexDir="column" minH="100vh">
            <AppContent />
          </Box>
        </ConsentProvider>
      </ChakraProvider>
    </AuthProvider>
  );
}
