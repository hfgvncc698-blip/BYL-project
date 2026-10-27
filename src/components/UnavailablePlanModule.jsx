import React from "react";
import { Box, Button, Heading, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import PlanInclusionBadge from "./PlanInclusionBadge";

// Do not mount the operational module: its effects may load or mutate data.
export default function UnavailablePlanModule({ module }) {
  const { t } = useTranslation("common");
  const nutrition = module === "nutrition";
  const guided = module === "guided";
  const features = guided ? [["nav.new_program_guided", "Nouveau programme guidé"]] : nutrition
    ? [["nutrition.title", "Nutrition"], ["nav.new_nutrition_assessment", "Nouveau bilan nutrition"], ["nav.new_menu", "Menus et rations"]]
    : [["nav.programs", "Programmes"], ["nav.new_program_manual", "Nouveau programme manuel"], ["nav.new_program_guided", "Nouveau programme guidé"]];
  return (
    <Box p={{ base: 4, md: 6 }} borderWidth="1px" borderRadius="22px">
      <HStack spacing={3} flexWrap="wrap" mb={3}>
        <Heading size="md">{guided ? t("nav.new_program_guided", "Nouveau programme guidé") : nutrition ? t("nutrition.title", "Nutrition") : "Sport"}</Heading>
        <PlanInclusionBadge included={false} />
      </HStack>
      <Text mb={4}>{t("plans.moduleNotIncluded", "Ce module n’est pas inclus dans votre pack. Ses fonctionnalités restent présentées ci-dessous.")}</Text>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
        {features.map(([key, label]) => <VStack key={key} align="stretch" borderWidth="1px" borderRadius="16px" p={4}>
          <Text fontWeight="bold">{t(key, label)}</Text>
          <Button isDisabled whiteSpace="normal" height="auto" minH="40px">{t(key, label)}</Button>
        </VStack>)}
      </SimpleGrid>
    </Box>
  );
}
