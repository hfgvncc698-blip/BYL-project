import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Circle,
  Heading,
  HStack,
  Icon,
  SimpleGrid,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { MdOutlineAutoAwesome } from "react-icons/md";
import {
  CLIENT_TUTORIAL_SHORTCUTS,
  CLUB_TUTORIAL_SHORTCUTS,
  COACH_TUTORIAL_SHORTCUTS,
  getGuidedTutorialRoute,
  startGuidedTutorial,
} from "./GuidedTutorial";

export default function TutorialSettingsPanel({
  role = "client",
  cardBg,
  borderColor,
  textColor,
  mutedText,
  hiddenShortcutIds = [],
  shortcutLabelOverrides = {},
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const hidden = new Set(hiddenShortcutIds);
  const source =
    role === "club"
      ? CLUB_TUTORIAL_SHORTCUTS
      : role === "coach"
      ? COACH_TUTORIAL_SHORTCUTS
      : CLIENT_TUTORIAL_SHORTCUTS;
  const shortcuts = source
    .filter((shortcut) => !hidden.has(shortcut.id))
    .map((shortcut) => ({
      ...shortcut,
      label:
        shortcutLabelOverrides[shortcut.id] ||
        t(shortcut.labelKey, shortcut.fallback || shortcut.id),
    }));
  const fallbackBg = useColorModeValue("white", "#0F172A");
  const fallbackBorder = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)");
  const softBg = useColorModeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.14)");
  const openShortcut = (shortcutId) => {
    startGuidedTutorial(shortcutId);
    const targetRoute = getGuidedTutorialRoute(shortcutId, role);
    if (targetRoute && window.location.pathname !== targetRoute) {
      navigate(targetRoute);
    }
  };

  return (
    <Box
      data-tour="tutorial-settings"
      bg={cardBg || fallbackBg}
      borderRadius="22px"
      border="1px solid"
      borderColor={borderColor || fallbackBorder}
      p={{ base: 5, md: 6 }}
      position="relative"
      overflow="hidden"
    >
      <HStack spacing={3} align="flex-start" mb={4}>
        <Circle size="42px" bg={softBg} color="#3B82F6" flexShrink={0}>
          <Icon as={MdOutlineAutoAwesome} boxSize="20px" />
        </Circle>
        <Box minW={0}>
          <Heading as="h2" size="md" color={textColor}>{t("auto.TutorialSettingsPanel.didacticiel", "Didacticiel")}</Heading>
          <Text mt={1} color={mutedText}>{t("auto.TutorialSettingsPanel.relancez_uniquement_la_partie_dont_vous_avez_besoi", "Relancez uniquement la partie dont vous avez besoin. Le guide vous emmène sur la bonne page et met l'élément concerné en surbrillance.")}</Text>
        </Box>
      </HStack>

      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
        {shortcuts.map((shortcut) => (
          <Button
            key={shortcut.id}
            borderRadius="full"
            variant="outline"
            justifyContent="flex-start"
            h="44px"
            onClick={() => openShortcut(shortcut.id)}
          >
            {shortcut.label}
          </Button>
        ))}
      </SimpleGrid>
    </Box>
  );
}
