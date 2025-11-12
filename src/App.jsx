// src/App.jsx
import React from "react";
import {
  ChakraProvider,
  ColorModeScript,
  extendTheme,
  Box,
} from "@chakra-ui/react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import "./i18n"; // i18n initialisé

import { AuthProvider, useAuth } from "./AuthContext";
import Navbar from "./components/Navbar";
import { Footer } from "./components/Footer";
import LanguageRouteSync from "./components/LanguageRouteSync.jsx";

// ⬇️ Géoloc & cookies
import GeolocationBootstrap from "./components/GeolocationBootstrap.jsx"; // écrit la position SEULEMENT si consentement + user
import SunColorModeSync from "./components/SunColorModeSync.jsx";         // thème clair/sombre (utilise la géoloc, ne stocke rien)
import { ConsentProvider } from "./consent/ConsentContext.jsx";           // contexte consentement
import CookieConsentBanner from "./components/CookieConsentBanner.jsx";   // bannière cookies

// ✅ Listener analytics (log des pages / pays / rôles)
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

// Paiement Stripe (pages retour)
import Success from "./pages/Success";
import Cancel from "./pages/Cancel";

// ✅ Carte du monde admin
import AdminGeo from "./pages/AdminGeo.jsx";

/* -------------------- Thème Chakra -------------------- */
const theme = extendTheme({
  config: { initialColorMode: "light", useSystemColorMode: false },
});

/* -------------------- Gardes unifiées -------------------- */

/** Auth requise (quel que soit le rôle) */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** Accès “espace coach” :
 *  - Coach actif (abonnement ou essai)
 *  - OU Admin (peut toujours accéder, même sans abonnement/essai)
 */
function CoachActiveRoute({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  if (isAdmin) return children; // admin a accès aux routes coach

  if (user.role !== "coach") return <Navigate to="/" replace />;

  const toMs = (d) =>
    d?.toDate
      ? d.toDate().getTime()
      : (typeof d === "string" || typeof d === "number")
      ? new Date(d).getTime()
      : 0;

  const now = Date.now();
  const end = toMs(user.trialEndsAt);
  const trialing = user.subscriptionStatus === "trialing" && end && now < end;

  const active = !!user.hasActiveSubscription || trialing;
  if (!active) return <Navigate to="/plans/professionnel" replace />;

  return children;
}

/** Accès Admin (rôle réel strict) */
function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

/* -------------------- Redirection d’accueil selon vue (viewAs) -------------------- */
function HomeRoute() {
  const { user, effectiveRole, isAdmin } = useAuth();

  // Non connecté → page publique
  if (!user) return <HomePage />;

  // Admin : s’il “voit comme Admin” → /admin, sinon → /coach-dashboard
  if (isAdmin) {
    return effectiveRole === "admin"
      ? <Navigate to="/admin" replace />
      : <Navigate to="/coach-dashboard" replace />;
  }

  // Coach → dashboard coach
  if (effectiveRole === "coach") return <Navigate to="/coach-dashboard" replace />;

  // Particulier → dashboard client
  if (user.role === "particulier") return <Navigate to="/user-dashboard" replace />;

  // Fallback
  return <HomePage />;
}

/* -------------------- Contenu de l’app (routes + footer) -------------------- */
function AppContent() {
  const location = useLocation();
  const noFooter = ["/login", "/register"].includes(location.pathname);

  return (
    <>
      {/* Synchronise la langue avec l’URL et applique LTR/RTL */}
      <LanguageRouteSync />

      {/* Thème auto jour/nuit — utilise la géoloc mais ne stocke rien */}
      <SunColorModeSync />
      {/* Géoloc côté analytics — s’active et écrit en base UNIQUEMENT si consentement + user connecté */}
      <GeolocationBootstrap />

      <Navbar />
      {/* ✅ Analytics : log chaque navigation (pages/pays/rôles) */}
      <RouteAnalyticsListener />

      <Box as="main" flex="1" minH="0">
        <Routes>
          {/* Accueil redirigé selon viewAs/role */}
          <Route path="/" element={<HomeRoute />} />

          {/* Offres */}
          <Route path="/plans/professionnel" element={<PlanProfessionnel />} />
          <Route path="/plans/particulier" element={<PlanParticulier />} />

          {/* Paiement / Premium */}
          <Route path="/programmes-premium" element={<PremiumPrograms />} />
          <Route path="/checkout/:productId" element={<Checkout />} />

          {/* Routes de retour Stripe */}
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

          {/* Pages publiques légales */}
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
              <ProtectedRoute>
                <ClientDashboard />
              </ProtectedRoute>
            }
          />

          {/* Profil Client */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePageClient />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mes-programmes"
            element={
              <ProtectedRoute>
                <MyPrograms />
              </ProtectedRoute>
            }
          />
          <Route
            path="/statistiques"
            element={
              <ProtectedRoute>
                <Statistics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPageClient />
              </ProtectedRoute>
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

          {/* Banque d’exercices seule (coach/admin) */}
          <Route
            path="/exercise-bank"
            element={
              <CoachActiveRoute>
                <ExerciseBank onAdd={() => {}} />
              </CoachActiveRoute>
            }
          />

          {/* Builder – routes existantes (coach/admin) */}
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

          {/* Espace Coach : clients & programmes */}
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

          {/* Vues Programmes (coach/admin) */}
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

          {/* Vue programme côté client (assigné) */}
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

          {/* Admin Dashboard (rôle réel admin uniquement) */}
          <Route
            path="/admin/*"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />

          {/* ✅ Carte du monde admin */}
          <Route
            path="/admin/geo"
            element={
              <AdminRoute>
                <AdminGeo />
              </AdminRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>

      {!noFooter && <Footer />}

      {/* Bannière cookies tant que non répondue */}
      <CookieConsentBanner />
    </>
  );
}

/* -------------------- Entrée de l’application -------------------- */
export default function App() {
  // ⚠️ PAS de BrowserRouter ici (il est dans main.jsx)
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

