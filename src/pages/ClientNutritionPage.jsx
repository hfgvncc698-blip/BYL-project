import { apiFetch } from "../utils/api";
// src/pages/ClientNutritionPage.jsx
import { useEffect, useState } from "react";
import { Box, Button, Flex, Heading, Text, useColorModeValue } from "@chakra-ui/react";
import { useAuth } from "../AuthContext.jsx";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "../components/ui/AppLoading.jsx";
import PageBackButton from "../components/ui/PageBackButton";
import { AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives";
import ClientNutritionSharedSection from "../components/ClientNutritionSharedSection.jsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function ClientNutritionPage() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useNutritionTheme();
  const pageBg = useColorModeValue("#F5F8FF", "#070B14");
  const panelTopBorder = useColorModeValue("#2563EB", "#7CB7FF");
  const panelProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderTop: "3px solid",
    borderTopColor: panelTopBorder,
    borderRadius: { base: "24px", md: "lg" },
    bg: theme.surfaceBg,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  };
  const [clientId, setClientId] = useState(null);
  const [clientIds, setClientIds] = useState([]);
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const snap = await resolveClientSnapshotForUser(user, { logPrefix: "ClientNutritionPage" });
        const { followups = [] } = await apiFetch("/clubs/my-followups");
        const hidden = new Set(followups.filter((row) => row.hidden).map((row) => row.id));
        if (alive) setClientIds([...new Set([snap?.id, ...followups.map((row) => row.id)])].filter((id) => id && !hidden.has(id)));
        if (snap?.exists?.() && alive) {
          setClientId(snap.id);
          setClientData(snap.data());
        } else if (alive) {
          setClientId(null);
          setClientData(null);
        }
      } catch {
        if (alive) setLoadError(true);
        // Le composant affichera l'état "non relié" si aucune piste ne passe les règles.
        if (alive) {
          setClientId(null);
          setClientData(null);
        }
      }

      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [user, loadAttempt]);

  if (loading) return <AppLoading label={t("clientNutrition.loading", "Chargement de ton suivi nutrition...")} />;

  if (loadError) return (
    <Box p={5} role="alert">
      <Text>{t("clientNutrition.loadError", "Impossible de charger les bilans partagés. Réessaie dans un instant.")}</Text>
      <Button mt={3} onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{t("common.retry", "Réessayer")}</Button>
    </Box>
  );

  return (
    <Box data-tour-page="client-nutrition" minH="100vh" bg={pageBg} color={theme.textColor} p={{ base: 3, md: 6 }} position="relative">
      <Box maxW="7xl" mx="auto">
        <AppSurface p={{ base: 4, md: 5 }} mb={{ base: 3, md: 5 }}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton />
            <AppSectionHeader
              flex="1"
              title={t("nav.nutrition", "Nutrition")}
              subtitle={t("clientNutrition.subtitle", "Menu, recettes, courses et conseils partagés par ton professionnel.")}
              headingAs="h1"
            />
          </Flex>
        </AppSurface>

        {clientId ? (
          <ClientNutritionSharedSection
            clientId={clientId}
            clientIds={clientIds}
            variant="full"
            onOpenJournal={() => navigate("/nutrition/journal")}
            clientName={[clientData?.firstName || clientData?.prenom, clientData?.lastName || clientData?.nom].filter(Boolean).join(" ")}
          />
        ) : (
          <Box data-tour="client-nutrition-empty" {...panelProps} p={5}>
            <Heading size="sm">{t("clientNutrition.noLinkedTitle", "Aucun dossier client relié")}</Heading>
            <Text color={theme.mutedText} mt={2}>
              {t("clientNutrition.noLinkedBody", "Ton compte n’est pas encore relié à une fiche client nutrition.")}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
