// src/components/GeolocationBootstrap.jsx
import React, { useState, useEffect, useRef } from "react";
import { Box, Button, Flex, Text, useColorModeValue } from "@chakra-ui/react";
import useGeolocation, { GEO_PERMISSION_DECISION_KEY } from "../hooks/useGeolocation";
import { useAuth } from "../AuthContext";
import { useConsent } from "../consent/ConsentContext";
import useLocationPreference from "../hooks/useLocationPreference";
import { useTranslation } from "react-i18next";

const wasRefused = () => {
  try { return localStorage.getItem(GEO_PERMISSION_DECISION_KEY) === "denied"; }
  catch { return false; }
};

export default function GeolocationBootstrap() {
  const { t } = useTranslation("common", { keyPrefix: "locationPrivacy" });
  const { effectiveRole, isAdmin, user } = useAuth();
  const { prefs } = useConsent();
  const [locationPreference] = useLocationPreference();
  const [dismissed, setDismissed] = useState(false);
  const [showReactivationHelp, setShowReactivationHelp] = useState(false);
  const previousUid = useRef(user?.uid || null);
  const background = useColorModeValue("white", "gray.800");

  const analyticsOn = !!prefs?.analytics || isAdmin || effectiveRole === "admin";
  const locationOn = analyticsOn && locationPreference !== false;

  const { status, retryPermission, permissionBlocked, permissionRenewalRequired } = useGeolocation({
    // ✅ On demande la géoloc uniquement si consentement analytics = true
    enabled: locationOn,
    disabledReason: locationPreference === false ? "disabled" : "analytics_disabled",

    // Garde la position à jour quand l'utilisateur change réellement de lieu
    // (voyage, sortie de veille, changement de réseau) au lieu de figer la
    // première mesure de la session.
    watch: true,

    // La position est publiée pour RouteAnalyticsListener, qui gère l'identité.
    saveAnalytics: locationOn,
  });

  useEffect(() => {
    const uid = user?.uid || null;
    if (previousUid.current === uid) return;
    previousUid.current = uid;
    setDismissed(false);
    setShowReactivationHelp(false);
    const refused = wasRefused();
    if (uid && refused) window.dispatchEvent(new Event('BYL_GEO_REQUEST'));
  }, [user?.uid]);

  if (!locationOn || dismissed || (status !== "denied" && !permissionRenewalRequired)) return null;

  const dismiss = () => {
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
        {!permissionBlocked && <Button minH="44px" onClick={() => { retryPermission(); }}>{t("activate")}</Button>}
        <Button minH="44px" variant="ghost" onClick={dismiss}>{t("later")}</Button>
      </Flex>
    </Box>
  );
}
