import { useEffect, useState } from "react";
import { Box, Flex, Heading, Text, useColorModeValue } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import ClientNutritionSharedSection from "../components/ClientNutritionSharedSection.jsx";
import AppLoading from "../components/ui/AppLoading.jsx";
import { AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives";
import PageBackButton from "../components/ui/PageBackButton";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";
import { useNutritionTheme } from "../styles/nutritionTheme";

export default function ClientNutritionJournalPage() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const location = useLocation();
  const theme = useNutritionTheme();
  const pageBg = useColorModeValue("#F5F8FF", "#070B14");
  const [clientId, setClientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const journalLink = new URLSearchParams(location.search);
  const initialJournalDateKey = journalLink.get("date") || "";
  const focusCoachFeedback = journalLink.get("focus") === "coach-feedback" || location.hash === "#coach-feedback";

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) {
        if (active) setLoading(false);
        return;
      }
      try {
        const snapshot = await resolveClientSnapshotForUser(user, { logPrefix: "ClientNutritionJournalPage" });
        if (active) setClientId(snapshot?.exists?.() ? snapshot.id : null);
      } catch {
        if (active) setClientId(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  if (loading) return <AppLoading label={t("clientNutritionJournal.pageLoading")} />;

  return (
    <Box data-tour-page="client-nutrition-journal" minH="100vh" bg={pageBg} color={theme.textColor} p={{ base: 3, md: 6 }}>
      <Box maxW="5xl" mx="auto">
        <AppSurface p={{ base: 4, md: 5 }} mb={{ base: 3, md: 5 }}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton fallbackTo="/nutrition" />
            <AppSectionHeader
              flex="1"
              title={t("clientNutritionJournal.pageTitle")}
              subtitle={t("clientNutritionJournal.pageSubtitle")}
              headingAs="h1"
            />
          </Flex>
        </AppSurface>

        {clientId ? (
          <ClientNutritionSharedSection
            clientId={clientId}
            variant="journal"
            initialJournalDateKey={initialJournalDateKey}
            focusCoachFeedback={focusCoachFeedback}
          />
        ) : (
          <AppSurface p={5}>
            <Heading size="sm">{t("clientNutritionJournal.noLinkedTitle")}</Heading>
            <Text color={theme.mutedText} mt={2}>{t("clientNutrition.noLinkedBody", "Ton compte n’est pas encore relié à une fiche client nutrition.")}</Text>
          </AppSurface>
        )}
      </Box>
    </Box>
  );
}
