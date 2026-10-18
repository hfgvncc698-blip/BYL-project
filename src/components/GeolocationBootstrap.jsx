// src/components/GeolocationBootstrap.jsx
import React, { useState, useEffect } from "react";
import { Box, Button, Flex, Text, useColorModeValue } from "@chakra-ui/react";
import useGeolocation from "../hooks/useGeolocation";
import { auth } from "../firebaseConfig";
import { claimGeolocationHelp } from "../utils/geolocationSession";
import { useAuth } from "../AuthContext";
import { useConsent } from "../consent/ConsentContext";
import useLocationPreference from "../hooks/useLocationPreference";
import useLocationSettingsReport from "../hooks/useLocationSettingsReport";
import { useTranslation } from "react-i18next";

export default function GeolocationBootstrap() {
  const { t } = useTranslation("common", { keyPrefix: "locationPrivacy" });
  const { effectiveRole, isAdmin, user, loading } = useAuth();
  const { prefs } = useConsent();
  const [locationPreference] = useLocationPreference();
  const [helpSession, setHelpSession] = useState(null);
  const [showReactivationHelp, setShowReactivationHelp] = useState(false);
  const sessionKey = user?.uid
    ? `${user.uid}:${auth.currentUser?.metadata?.lastSignInTime || "restoring"}`
    : "anonymous";
  const background = useColorModeValue("white", "gray.800");

  const analyticsOn = !!prefs?.analytics || isAdmin || effectiveRole === "admin";
  useLocationSettingsReport(loading ? null : user?.uid, locationPreference, analyticsOn);
  const locationOn = !loading && analyticsOn && locationPreference !== false;

  const { permissionBlocked } = useGeolocation({
    // ✅ On demande la géoloc uniquement si consentement analytics = true
    enabled: locationOn,
    sessionKey,
    disabledReason: locationPreference === false ? "disabled" : "analytics_disabled",

    // Garde la position à jour quand l'utilisateur change réellement de lieu
    // (voyage, sortie de veille, changement de réseau) au lieu de figer la
    // première mesure de la session.
    watch: true,

    // La position est publiée pour RouteAnalyticsListener, qui gère l'identité.
    saveAnalytics: locationOn,
  });

  useEffect(() => {
    if (!locationOn || !permissionBlocked) {
      setHelpSession(null);
      return;
    }
    if (claimGeolocationHelp(sessionKey)) {
      setHelpSession(sessionKey);
      setShowReactivationHelp(false);
    }
  }, [locationOn, permissionBlocked, sessionKey]);

  if (!locationOn || !permissionBlocked || helpSession !== sessionKey) return null;

  const dismiss = () => setHelpSession(null);

  return (
    <Box position="fixed" bottom="calc(90px + env(safe-area-inset-bottom, 0px))"
      right={{ base: "12px", md: "24px" }} left={{ base: "12px", md: "auto" }}
      maxW="420px" maxH="50dvh" overflowY="auto" zIndex="toast" bg={background}
      borderWidth="1px" borderRadius="xl" boxShadow="lg" p={4} role="region" aria-label={t("title")}>
      <Text fontWeight="bold">{t("blocked")}</Text>
      <Text fontSize="sm" mt={2}>
        {t("reminderBody")} {t("browserSettings")}
      </Text>
      {permissionBlocked && showReactivationHelp && (
        <Box id="location-reactivation-help" mt={3} p={3} borderWidth="1px" borderRadius="md">
          <Text fontSize="sm">{t("reactivateSteps")}</Text>
        </Box>
      )}
      <Flex gap={2} mt={3} wrap="wrap">
        {permissionBlocked && (
          <Button minH="44px" aria-expanded={showReactivationHelp} aria-controls="location-reactivation-help"
            onClick={() => setShowReactivationHelp((visible) => !visible)}>{t("reactivateHelp")}</Button>
        )}
        <Button minH="44px" variant="ghost" onClick={dismiss}>{t("later")}</Button>
      </Flex>
    </Box>
  );
}
