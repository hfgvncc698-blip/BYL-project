// src/components/CookieConsentBanner.jsx
import React from "react";
import {
  Box,
  Button,
  Stack,
  Text,
  Link,
  useColorModeValue,
} from "@chakra-ui/react";
import { useConsent } from "../consent/ConsentContext";
import { Trans, useTranslation } from "react-i18next";

export default function CookieConsentBanner() {
  const { t } = useTranslation("common");
  const { asked, save, loaded } = useConsent();
  const bg = useColorModeValue("gray.50", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");

  // ✅ on attend que le context soit hydraté
  if (!loaded) return null;
  if (asked) return null;

  const acceptAll = () => save({ analytics: true, marketing: true });
  const refuseAll = () => save({ analytics: false, marketing: false });

  return (
    <Box
      position="fixed"
      bottom="0"
      left="0"
      right="0"
      zIndex={1000}
      bg={bg}
      borderTop="1px solid"
      borderColor={border}
      p={4}
    >
      <Stack
        direction="column"
        spacing={3}
        maxW="6xl"
        mx="auto"
        position="relative"
      >
        {/* Lien discret en haut à droite */}
        <Box position="absolute" top="0" right="0" p={2}>
          <Button
            variant="link"
            fontSize="xs"
            color="gray.400"
            _hover={{ color: "gray.600" }}
            onClick={refuseAll}
          >
            {t("cookies.continueWithoutConsent", "Continuer sans consentir")}
          </Button>
        </Box>

        <Text fontWeight="semibold">{t("cookies.title", "Cookies & confidentialité")}</Text>
        <Text fontSize="sm">
          <Trans
            i18nKey="cookies.body"
            t={t}
            components={{ strong: <strong />, em: <em /> }}
          />
          {" "}
          <Link href="/privacy" textDecoration="underline">
            {t("cookies.learnMore", "En savoir plus")}
          </Link>
          .
        </Text>

        <Stack direction="row" spacing={2}>
          <Button colorScheme="blue" onClick={acceptAll}>
            {t("cookies.acceptAll", "Tout accepter")}
          </Button>
          <Button variant="outline" onClick={refuseAll}>
            {t("cookies.refuseAll", "Tout refuser")}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
