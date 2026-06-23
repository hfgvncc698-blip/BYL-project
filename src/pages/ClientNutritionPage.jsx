// src/pages/ClientNutritionPage.jsx
import { useEffect, useState } from "react";
import { Box, Heading, Text } from "@chakra-ui/react";
import { useAuth } from "../AuthContext.jsx";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "../components/ui/AppLoading.jsx";
import PageBackButton from "../components/ui/PageBackButton";
import ClientNutritionSharedSection from "../components/ClientNutritionSharedSection.jsx";
import { useTranslation } from "react-i18next";

export default function ClientNutritionPage() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const theme = useNutritionTheme();
  const panelProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderRadius: "lg",
    bg: theme.surfaceBg,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  };
  const [clientId, setClientId] = useState(null);
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const snap = await resolveClientSnapshotForUser(user, { logPrefix: "ClientNutritionPage" });
        if (snap?.exists?.() && alive) {
          setClientId(snap.id);
          setClientData(snap.data());
        } else if (alive) {
          setClientId(null);
          setClientData(null);
        }
      } catch {
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
  }, [user]);

  if (loading) return <AppLoading label={t("clientNutrition.loading", "Chargement de ton suivi nutrition...")} />;

  return (
    <Box data-tour-page="client-nutrition" minH="100vh" bg={theme.pageBg} color={theme.textColor} p={{ base: 3, md: 6 }} position="relative">
      <Box position="absolute" top={{ base: 3, md: 6 }} left={{ base: 3, md: 6 }} zIndex={20}>
        <PageBackButton />
      </Box>
      <Box maxW="7xl" mx="auto">
        <Box {...panelProps} p={{ base: 4, md: 5 }} mb={{ base: 3, md: 5 }} pt={{ base: 12, md: 5 }}>
          <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText}>
            {t("clientNutrition.eyebrow", "ESPACE CLIENT")}
          </Text>
          <Heading size={{ base: "md", md: "lg" }} mt={1}>
            {t("nav.nutrition", "Nutrition")}
          </Heading>
          <Text color={theme.mutedText} mt={2} fontSize={{ base: "sm", md: "md" }}>
            {t("clientNutrition.subtitle", "Tout ce que ton professionnel a partagé : menu, recettes, courses et conseils.")}
          </Text>
        </Box>

        {clientId ? (
          <ClientNutritionSharedSection
            clientId={clientId}
            variant="full"
            clientName={[clientData?.firstName || clientData?.prenom, clientData?.lastName || clientData?.nom].filter(Boolean).join(" ")}
          />
        ) : (
          <Box {...panelProps} p={5}>
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
