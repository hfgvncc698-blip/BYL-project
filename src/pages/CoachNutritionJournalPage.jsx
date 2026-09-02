import { Box, Flex, useColorModeValue } from "@chakra-ui/react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CoachNutritionDailySummary } from "../components/ClientNutritionDailyJournal.jsx";
import { AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives.jsx";
import PageBackButton from "../components/ui/PageBackButton.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";

export default function CoachNutritionJournalPage() {
  const { clientId } = useParams();
  const { t } = useTranslation();
  const theme = useNutritionTheme();
  const pageBg = useColorModeValue("#F5F8FF", "#070B14");

  return (
    <Box minH="100vh" bg={pageBg} color={theme.textColor} p={{ base: 3, md: 6 }}>
      <Box maxW="6xl" mx="auto">
        <AppSurface p={{ base: 4, md: 5 }} mb={{ base: 3, md: 5 }}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton fallbackTo={`/clients/${clientId}`} />
            <AppSectionHeader
              flex="1"
              title={t("coachNutritionJournal.pageTitle")}
              subtitle={t("coachNutritionJournal.pageSubtitle")}
              headingAs="h1"
            />
          </Flex>
        </AppSurface>

        <CoachNutritionDailySummary clientId={clientId} variant="full" />
      </Box>
    </Box>
  );
}
