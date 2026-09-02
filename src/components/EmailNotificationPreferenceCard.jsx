import React, { useEffect, useState } from "react";
import {
  Box,
  Circle,
  Flex,
  Heading,
  HStack,
  Icon,
  Switch,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { MdOutlineEmail } from "react-icons/md";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { apiFetch } from "../utils/api";

const SAVE_TIMEOUT_MS = 12000;

function notificationsEnabled(user) {
  return (
    user?.settings?.emailNotificationsEnabled !== false &&
    user?.emailPreferences?.allAutomatic !== false
  );
}

function messagingNotificationsEnabled(user) {
  return user?.emailPreferences?.messaging !== false;
}

export default function EmailNotificationPreferenceCard({
  surfaceProps = {},
  textColor = "inherit",
  mutedText = "gray.500",
  borderColor = "gray.200",
  softBg = "transparent",
  accentColor = "#2563EB",
}) {
  const { user } = useAuth();
  const { t } = useTranslation("common");
  const toast = useToast();
  const [enabled, setEnabled] = useState(() => notificationsEnabled(user));
  const [messagingEnabled, setMessagingEnabled] = useState(() => messagingNotificationsEnabled(user));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    apiFetch("/client-profile/email-preferences", {
      signal: controller.signal,
    })
      .then((data) => {
        if (typeof data?.enabled === "boolean") setEnabled(data.enabled);
        if (typeof data?.messagingEnabled === "boolean") setMessagingEnabled(data.messagingEnabled);
      })
      .catch(() => {
        // La valeur du profil déjà chargée reste un repli valide.
      })
      .finally(() => globalThis.clearTimeout(timeoutId));
    return () => {
      globalThis.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [user?.uid]);

  const handleChange = async (event) => {
    if (!user?.uid || saving) return;
    const nextEnabled = event.target.checked;
    const previous = enabled;
    setEnabled(nextEnabled);
    setSaving(true);

    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    try {
      await apiFetch("/client-profile/email-preferences", {
        method: "PUT",
        body: JSON.stringify({ enabled: nextEnabled }),
        signal: controller.signal,
      });
      toast({
        title: nextEnabled
          ? t("settings.email.enabled_title", "Notifications activées")
          : t("settings.email.disabled_title", "Notifications désactivées"),
        description: nextEnabled
          ? t(
              "settings.email.enabled_description",
              "Vous recevrez de nouveau les e-mails automatiques."
            )
          : t(
              "settings.email.disabled_description",
              "Aucun nouvel e-mail automatique ne sera envoyé."
            ),
        status: "success",
        duration: 3500,
        isClosable: true,
      });
    } catch (error) {
      setEnabled(previous);
      const timedOut = error?.name === "AbortError";
      toast({
        title: t("settings.email.save_error_title", "Préférence non enregistrée"),
        description: timedOut
          ? t(
              "settings.email.save_timeout_description",
              "Le serveur met trop de temps à répondre. La préférence n’a pas été modifiée."
            )
          : error?.message ||
            t("settings.email.save_error_description", "Réessayez dans quelques instants."),
        status: "error",
        duration: 4500,
        isClosable: true,
      });
    } finally {
      globalThis.clearTimeout(timeoutId);
      setSaving(false);
    }
  };

  const handleMessagingChange = async (event) => {
    if (!user?.uid || saving) return;
    const nextEnabled = event.target.checked;
    const previous = messagingEnabled;
    setMessagingEnabled(nextEnabled);
    setSaving(true);

    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    try {
      await apiFetch("/client-profile/email-preferences", {
        method: "PUT",
        body: JSON.stringify({ messagingEnabled: nextEnabled }),
        signal: controller.signal,
      });
      toast({
        title: t("settings.email.messaging_saved", "Préférence de messagerie enregistrée"),
        description: nextEnabled
          ? t("settings.email.messaging_enabled", "Vous recevrez un e-mail lors d’un nouveau message.")
          : t("settings.email.messaging_disabled", "Les nouveaux messages ne déclencheront plus d’e-mail."),
        status: "success",
        duration: 3500,
        isClosable: true,
      });
    } catch (error) {
      setMessagingEnabled(previous);
      toast({
        title: t("settings.email.save_error_title", "Préférence non enregistrée"),
        description: error?.message || t("settings.email.save_error_description", "Réessayez dans quelques instants."),
        status: "error",
        duration: 4500,
        isClosable: true,
      });
    } finally {
      globalThis.clearTimeout(timeoutId);
      setSaving(false);
    }
  };

  return (
    <Box {...surfaceProps} p={{ base: 5, md: 6 }}>
      <Flex
        direction={{ base: "column", sm: "row" }}
        align={{ base: "stretch", sm: "center" }}
        justify="space-between"
        gap={5}
      >
        <HStack spacing={3} align="flex-start">
          <Circle
            size="42px"
            bg="rgba(37,99,235,0.10)"
            color={accentColor}
            flexShrink={0}
          >
            <Icon as={MdOutlineEmail} boxSize="20px" />
          </Circle>
          <Box>
            <Heading as="h2" size="md" color={textColor}>
              {t("settings.sections.email_notifications", "Notifications par e-mail")}
            </Heading>
            <Text mt={1} color={mutedText} fontSize="sm">
              {t(
                "settings.email.description",
                "Recevez les informations automatiques liées à votre compte et à votre activité."
              )}
            </Text>
            <Text mt={2} color={mutedText} fontSize="xs">
              {t(
                "settings.email.essential_notice",
                "Les e-mails de sécurité demandés, comme la réinitialisation du mot de passe, restent disponibles."
              )}
            </Text>
          </Box>
        </HStack>

        <VStack align="stretch" spacing={2} minW={{ sm: "250px" }}>
          <Flex
            bg={softBg}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="18px"
            px={4}
            py={3}
            align="center"
            justify="space-between"
            gap={4}
          >
            <Box>
              <Text fontWeight="800" color={textColor}>
                {t("settings.email.all_automatic", "Tous les e-mails automatiques")}
              </Text>
              <Text fontSize="xs" color={mutedText}>
                {saving
                  ? t("settings.email.saving", "Enregistrement…")
                  : enabled
                    ? t("settings.email.status_enabled", "Activés")
                    : t("settings.email.status_disabled", "Désactivés")}
              </Text>
            </Box>
            <Switch
              colorScheme="blue"
              size="lg"
              isChecked={enabled}
              isDisabled={saving}
              onChange={handleChange}
              aria-label={t(
                "settings.email.toggle_label",
                "Activer ou désactiver les notifications automatiques par e-mail"
              )}
            />
          </Flex>

          <Flex
            bg={softBg}
            border="1px solid"
            borderColor={borderColor}
            borderRadius="18px"
            px={4}
            py={3}
            align="center"
            justify="space-between"
            gap={4}
            opacity={enabled ? 1 : 0.58}
          >
            <Box>
              <Text fontWeight="800" color={textColor}>
                {t("settings.email.messaging_label", "E-mails de messagerie")}
              </Text>
              <Text fontSize="xs" color={mutedText}>
                {t("settings.email.messaging_hint", "Lors d’un nouveau message")}
              </Text>
            </Box>
            <Switch
              colorScheme="blue"
              size="lg"
              isChecked={messagingEnabled}
              isDisabled={saving || !enabled}
              onChange={handleMessagingChange}
              aria-label={t("settings.email.messaging_toggle", "Activer ou désactiver les e-mails de messagerie")}
            />
          </Flex>
        </VStack>
      </Flex>
    </Box>
  );
}
