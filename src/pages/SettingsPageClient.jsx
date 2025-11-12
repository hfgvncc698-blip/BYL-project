// src/pages/SettingsPageClient.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Heading,
  Select,
  Switch,
  FormControl,
  FormLabel,
  VStack,
  Checkbox,
  Button,
  Text,
  useToast,
  Divider,
  useColorMode,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Badge,
  HStack,
  Spinner,
} from "@chakra-ui/react";
import { useAuth } from "../AuthContext";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTranslation } from "react-i18next";

// ✅ helper HTTP centralisé (ajoute /api et credentials: 'include')
import { apiFetch } from "../utils/api";

const SUPPORTED = ["fr", "en", "de", "it", "es", "ru", "ar"];
const normalizeLang = (lng) => (lng || "fr").split("-")[0].toLowerCase();

export default function SettingsPageClient() {
  const { user, resetPassword } = useAuth();
  const toast = useToast();
  const { colorMode, toggleColorMode } = useColorMode();
  const darkMode = colorMode === "dark";
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t, i18n } = useTranslation("common");

  const [sendingReset, setSendingReset] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  // Notifications côté client (plus simple que coach)
  const [notifications, setNotifications] = useState({
    reminders: false,
    newsletter: false,
  });

  // Langue initiale: Firestore -> user -> i18n
  const initialLang =
    user?.settings?.defaultLanguage ||
    user?.preferredLang ||
    normalizeLang(i18n.resolvedLanguage) ||
    "fr";
  const [selectedLang, setSelectedLang] = useState(initialLang);

  // ↻ Sync si on change la langue via la navbar
  useEffect(() => {
    const lng = normalizeLang(i18n.language);
    if (SUPPORTED.includes(lng)) setSelectedLang(lng);
  }, [i18n.language]);

  // Stripe infos (affichage badges comme coach)
  const subStatus = user?.subscriptionStatus || "canceled";
  const hasStripeCustomer = Boolean(
    user?.stripeCustomerId || user?.stripe?.customerId
  );
  const stripeCustomerId =
    user?.stripeCustomerId || user?.stripe?.customerId || null;
  const stripeSubscriptionId =
    user?.stripeSubscriptionId || user?.stripe?.subscriptionId || null;

  const subBadge = useMemo(() => {
    if (subStatus === "active") return { color: "green", label: "ACCÈS ACTIF" };
    if (subStatus === "trialing") return { color: "yellow", label: "ESSAI EN COURS" };
    if (subStatus === "past_due") return { color: "orange", label: "PAIEMENT EN RETARD" };
    if (subStatus === "canceled") return { color: "gray", label: "ANNULÉ / INACTIF" };
    return { color: "gray", label: subStatus.toUpperCase() };
  }, [subStatus]);

  // ---- Changement langue (UI + i18n + Firestore) ----
  const handleLangChange = async (e) => {
    if (!user?.uid) return;
    const newLang = normalizeLang(e.target.value || "fr");
    if (!SUPPORTED.includes(newLang)) return;

    try {
      await i18n.changeLanguage(newLang);
      localStorage.setItem("i18nextLng", newLang);
      setSelectedLang(newLang);

      const ref = doc(db, "users", user.uid);
      try {
        await updateDoc(ref, { "settings.defaultLanguage": newLang });
      } catch (err) {
        // Crée le doc si besoin
        if (err?.code === "not-found" || err?.message?.includes("No document")) {
          await setDoc(ref, { settings: { defaultLanguage: newLang } }, { merge: true });
        } else {
          throw err;
        }
      }

      toast({ description: t("settings.toasts.lang_updated"), status: "success", duration: 3000 });
    } catch (err) {
      const msg =
        err?.code === "permission-denied"
          ? t("settings.toasts.firestore_perm_denied")
          : err?.message || t("settings.toasts.update_error");
      toast({ description: msg, status: "error", duration: 4000 });
    }
  };

  // ---- Stripe customer portal (via apiFetch) ----
  const handleOpenStripePortal = async () => {
    if (!user?.uid) {
      toast({ description: t("errors.not_logged_in") || "User not logged in.", status: "warning" });
      return;
    }
    if (!hasStripeCustomer) {
      toast({
        description:
          "Votre compte n’est pas encore lié à Stripe (stripeCustomerId manquant).",
        status: "warning",
      });
      return;
    }
    setStripeLoading(true);
    try {
      const data = await apiFetch("/payments/create-stripe-portal-session", {
        method: "POST",
        body: JSON.stringify({
          userId: user.uid,
          returnUrl: `${window.location.origin}/settings`,
        }),
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({ description: t("settings.toasts.stripe_url_error"), status: "error" });
      }
    } catch (err) {
      toast({
        description: t("settings.toasts.stripe_comm_error"),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setStripeLoading(false);
    }
  };

  const handleNotifChange = (name) => (e) => {
    setNotifications((p) => ({ ...p, [name]: e.target.checked }));
    // Si tu veux persister :
    // await updateDoc(doc(db,'users',user.uid), { [`settings.${name}`]: e.target.checked })
  };

  if (!user) {
    return (
      <Box p={8}>
        <HStack spacing={3}>
          <Spinner />
          <Text>{t("common.loading", "Chargement…")}</Text>
        </HStack>
      </Box>
    );
  }

  return (
    <Box p={8} maxW="800px" mx="auto">
      <Heading as="h1" size="xl" mb={6}>
        {t("settings.title")}
      </Heading>

      {/* Langue par défaut */}
      <Box mb={8}>
        <Heading as="h2" size="lg" mb={4}>
          {t("settings.sections.language")}
        </Heading>
        <FormControl display="flex" alignItems="center" gap={8}>
          <Box maxW="260px" w="full">
            <FormLabel mb="1">{t("settings.fields.default_language")}</FormLabel>
            <Select value={selectedLang} onChange={handleLangChange}>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
              <option value="es">Español</option>
              <option value="ru">Русский</option>
              <option value="ar">العربية</option>
            </Select>
          </Box>

          <FormControl maxW="220px" display="flex" alignItems="center">
            <FormLabel htmlFor="dark-mode" mb="0">
              {t("settings.fields.dark_mode")}
            </FormLabel>
            <Switch id="dark-mode" isChecked={darkMode} onChange={toggleColorMode} colorScheme="blue" />
          </FormControl>
        </FormControl>
      </Box>

      <Divider mb={8} />

      {/* Notifications email */}
      <Box mb={8}>
        <Heading as="h2" size="lg" mb={4}>
          {t("settings.sections.email_notifications")}
        </Heading>
        <VStack align="start">
          <Checkbox
            isChecked={notifications.reminders}
            onChange={handleNotifChange("reminders")}
            colorScheme="blue"
          >
            {t("settings.fields.reminders")}
          </Checkbox>
          <Checkbox
            isChecked={notifications.newsletter}
            onChange={handleNotifChange("newsletter")}
            colorScheme="blue"
          >
            {t("settings.fields.newsletter")}
          </Checkbox>
        </VStack>
      </Box>

      <Divider mb={8} />

      {/* Abonnement / Stripe */}
      <Box mb={8}>
        <Heading as="h2" size="lg" mb={2}>
          {t("settings.sections.subscription")}
        </Heading>

        <HStack spacing={3} mb={3}>
          <Badge colorScheme={subBadge.color}>{subBadge.label}</Badge>
          {user?.hasActiveSubscription ? (
            <Badge colorScheme="green">ACCÈS ACTIF</Badge>
          ) : (
            <Badge colorScheme="gray">ANNULÉ / INACTIF</Badge>
          )}
        </HStack>

        {hasStripeCustomer && (
          <Text fontSize="xs" color="gray.500" mb={4}>
            Client Stripe : {stripeCustomerId}
            {stripeSubscriptionId ? ` • Abonnement : ${stripeSubscriptionId}` : ""}
          </Text>
        )}

        <Text mb={4}>{t("settings.subscription_hint")}</Text>

        <Button
          colorScheme="blue"
          borderRadius="xl"
          fontWeight="bold"
          onClick={handleOpenStripePortal}
          isLoading={stripeLoading}
          loadingText="Connexion à Stripe…"
          isDisabled={!hasStripeCustomer}
        >
          {t("settings.buttons.open_stripe_portal")}
        </Button>

        {!hasStripeCustomer && (
          <Text mt={2} fontSize="sm" color="orange.300">
            Votre compte n’est pas encore lié à Stripe (stripeCustomerId manquant).
          </Text>
        )}
      </Box>

      <Divider mb={8} />

      {/* Sécurité */}
      <Box mb={8}>
        <Heading as="h2" size="lg" mb={4}>
          {t("settings.sections.security")}
        </Heading>
        <Text mb={4}>{t("settings.reset_hint")}</Text>
        <Button
          colorScheme="blue"
          isLoading={sendingReset}
          onClick={async () => {
            setSendingReset(true);
            try {
              const langForEmail = selectedLang || "fr";
              await resetPassword(user.email, langForEmail);
              toast({ description: t("settings.toasts.reset_sent"), status: "success", duration: 3000 });
            } catch {
              toast({ description: t("settings.toasts.reset_error"), status: "error", duration: 3000 });
            } finally {
              setSendingReset(false);
            }
          }}
        >
          {t("settings.buttons.send_reset")}
        </Button>
      </Box>

      {/* Danger Zone */}
      <Box>
        <Heading as="h2" size="lg" mb={4} color="red.500">
          {t("settings.sections.danger_zone")}
        </Heading>
        <Text mb={4}>{t("settings.delete_hint")}</Text>
        <Button colorScheme="red" variant="outline" onClick={onOpen}>
          {t("settings.buttons.delete_account")}
        </Button>
      </Box>

      {/* Confirmation suppression */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("settings.modal.confirm_title")}</ModalHeader>
          <ModalBody>{t("settings.modal.confirm_body")}</ModalBody>
          <ModalFooter>
            <Button mr={3} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button colorScheme="red" onClick={() => { onClose(); toast({ description: t("settings.toasts.account_deleted"), status: "info" }); }}>
              {t("actions.delete")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

