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

export default function CookieConsentBanner() {
  const { asked, save } = useConsent();
  const bg = useColorModeValue("gray.50", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
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
            Continuer sans consentir
          </Button>
        </Box>

        <Text fontWeight="semibold">Cookies & confidentialité</Text>
        <Text fontSize="sm">
          Nous utilisons des cookies nécessaires au bon fonctionnement du site
          (obligatoires). Pour les <strong>statistiques</strong> et le{" "}
          <strong>marketing</strong>, nous avons besoin de votre accord. Le
          thème clair/sombre peut utiliser votre position{" "}
          <em>sans la stocker</em>.{" "}
          <Link href="/privacy" textDecoration="underline">
            En savoir plus
          </Link>
          .
        </Text>

        <Stack direction="row" spacing={2}>
          <Button colorScheme="blue" onClick={acceptAll}>
            Tout accepter
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

