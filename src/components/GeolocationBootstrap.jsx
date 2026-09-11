// src/components/GeolocationBootstrap.jsx
import React, { useState } from "react";
import { Box, Button, Flex, Text, useColorModeValue } from "@chakra-ui/react";
import useGeolocation, { GEO_PERMISSION_DECISION_KEY } from "../hooks/useGeolocation";
import { useAuth } from "../AuthContext";
import { useConsent } from "../consent/ConsentContext";
import useLocationPreference from "../hooks/useLocationPreference";
import { useTranslation } from "react-i18next";

// Lifetime of this document, not each route or authentication render.
let reminderDismissed = false;
let refusedBeforeOpening = false;
try { refusedBeforeOpening = localStorage.getItem(GEO_PERMISSION_DECISION_KEY) === "denied"; } catch { /* optional storage */ }

export default function GeolocationBootstrap() {
  const { t } = useTranslation("common", { keyPrefix: "locationPrivacy" });
  const { effectiveRole, isAdmin } = useAuth();
  const { prefs } = useConsent();
  const [locationPreference] = useLocationPreference();
  const [dismissed, setDismissed] = useState(reminderDismissed);
  const background = useColorModeValue("white", "gray.800");

  const analyticsOn = !!prefs?.analytics || isAdmin || effectiveRole === "admin";
  const locationOn = analyticsOn && locationPreference !== false;

  const { status, retryPermission, permissionBlocked } = useGeolocation({
    // ✅ On demande la géoloc uniquement si consentement analytics = true
    enabled: locationOn,

    // Garde la position à jour quand l'utilisateur change réellement de lieu
    // (voyage, sortie de veille, changement de réseau) au lieu de figer la
    // première mesure de la session.
    watch: true,

    // La position est publiée pour RouteAnalyticsListener, qui gère l'identité.
    saveAnalytics: locationOn,
  });

  if (!locationOn || dismissed || !refusedBeforeOpening || status !== "denied") return null;

  const dismiss = () => {
    reminderDismissed = true;
    setDismissed(true);
  };

  return (
    <Box position="fixed" bottom="calc(90px + env(safe-area-inset-bottom, 0px))"
      right={{ base: "12px", md: "24px" }} left={{ base: "12px", md: "auto" }}
      maxW="420px" maxH="50dvh" overflowY="auto" zIndex="toast" bg={background}
      borderWidth="1px" borderRadius="xl" boxShadow="lg" p={4} role="region" aria-label={t("title")}>
      <Text fontWeight="bold">{t("reminderTitle")}</Text>
      <Text fontSize="sm" mt={2}>
        {t("reminderBody")} {t(permissionBlocked ? "browserSettings" : "retryHelp")}
      </Text>
      <Flex gap={2} mt={3} wrap="wrap">
        {!permissionBlocked && <Button minH="44px" onClick={() => { retryPermission(); dismiss(); }}>{t("retry")}</Button>}
        <Button minH="44px" variant="ghost" onClick={dismiss}>{t("later")}</Button>
      </Flex>
    </Box>
  );
}
