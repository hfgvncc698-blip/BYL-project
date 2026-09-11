import React, { useEffect, useState } from "react";
import { Box, Flex, Heading, Text, Switch, FormControl, FormLabel, Badge, useToast } from "@chakra-ui/react";
import { useAuth } from "../AuthContext";
import { useConsent } from "../consent/ConsentContext";
import useLocationPreference from "../hooks/useLocationPreference";
import { useTranslation } from "react-i18next";

export default function LocationPreferenceCard({ surfaceProps = {}, mutedText }) {
  const { t } = useTranslation("common", { keyPrefix: "locationPrivacy" });
  const [preference, setPreference] = useLocationPreference();
  const { prefs } = useConsent();
  const { isAdmin, effectiveRole } = useAuth();
  const analyticsOn = !!prefs?.analytics || isAdmin || effectiveRole === "admin";
  const enabled = preference ?? analyticsOn;
  const [permission, setPermission] = useState("unknown");
  const toast = useToast();
  useEffect(() => {
    let cancelled = false;
    let result;
    const update = () => { if (!cancelled) setPermission(result.state); };
    if (!navigator.geolocation) setPermission("unsupported");
    else navigator.permissions?.query({ name: "geolocation" }).then((value) => {
      if (cancelled) return;
      result = value;
      update();
      result.addEventListener("change", update);
    }).catch(() => {});
    return () => { cancelled = true; result?.removeEventListener("change", update); };
  }, []);
  const label = t(!enabled ? "off" : permission === "unsupported" ? "unsupported"
    : !analyticsOn ? "consent" : permission === "granted" ? "granted"
    : permission === "denied" ? "blocked" : "unknown");
  return (
    <Box {...surfaceProps}>
      <Heading size="md">{t("title")}</Heading>
      <Text color={mutedText} mt={2}>{t("description")}</Text>
      <FormControl display="flex" alignItems="center" justifyContent="space-between" gap={4} mt={5}>
        <FormLabel htmlFor="location-preference" mb={0}>{t("toggle")}</FormLabel>
        <Switch id="location-preference" size="lg" flexShrink={0} isChecked={enabled}
          aria-describedby="location-preference-help" onChange={(event) => {
            try { setPreference(event.target.checked); }
            catch { toast({ status: "error", description: t("saveError") }); }
          }} />
      </FormControl>
      <Flex mt={3}><Badge whiteSpace="normal">{label}</Badge></Flex>
      <Text id="location-preference-help" color={mutedText} fontSize="sm" mt={3}>
        {t("scope")}
        {permission === "denied" && ` ${t("browserSettings")}`}
        {!analyticsOn && ` ${t("analyticsHelp")}`}
        {enabled && permission !== "denied" && ` ${t("temporary")}`}
      </Text>
    </Box>
  );
}
