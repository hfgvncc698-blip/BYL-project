// src/pages/SettingsPageClient.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Heading, Select, Switch, FormControl, FormLabel, VStack,
  Checkbox, Button, Text, useToast, Divider, useColorMode, useDisclosure,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Badge, HStack, Spinner
} from "@chakra-ui/react";
import { useAuth } from "../AuthContext";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTranslation } from "react-i18next";

// ✅ base API centralisée (garantit .../api)
import { getApiBase } from "../utils/apiBase";
const API_BASE = getApiBase();

const SUPPORTED = ["fr","en","de","it","es","ru","ar"];
const normalize = (lng) => (lng || "fr").split("-")[0].toLowerCase();

export default function SettingsPageClient() {
  const { user, resetPassword } = useAuth();
  const toast = useToast();
  const { colorMode, toggleColorMode } = useColorMode();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t, i18n } = useTranslation("common");

  const [sendingReset, setSendingReset] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [notifications, setNotifications] = useState({ reminders: false, newsletter: false });

  const initialLang =
    user?.settings?.defaultLanguage ||
    user?.preferredLang ||
    normalize(i18n.resolvedLanguage) ||
    "fr";
  const [selectedLang, setSelectedLang] = useState(initialLang);

  useEffect(() => {
    const lng = normalize(i18n.language);
    if (SUPPORTED.includes(lng)) setSelectedLang(lng);
  }, [i18n.language]);

  const subStatus = user?.subscriptionStatus || "canceled";
  const hasStripeCustomer = Boolean(user?.stripeCustomerId || user?.stripe?.customerId);
  const stripeCustomerId = user?.stripeCustomerId || user?.stripe?.customerId || null;
  const stripeSubscriptionId = user?.stripeSubscriptionId || user?.stripe?.subscriptionId || null;

  const subBadge = useMemo(() => {
    if (subStatus === "active") return { color: "green", label: "ACCÈS ACTIF" };
    if (subStatus === "trialing") return { color: "yellow", label: "ESSAI EN COURS" };
    if (subStatus === "past_due") return { color: "orange", label: "PAIEMENT EN RETARD" };
    if (subStatus === "canceled") return { color: "gray", label: "ANNULÉ / INACTIF" };
    return { color: "gray", label: subStatus.toUpperCase() };
  }, [subStatus]);

  const handleLangChange = async (e) => {
    if (!user?.uid) return;
    const newLang = normalize(e.target.value || "fr");
    if (!SUPPORTED.includes(newLang)) return;
    try {
      await i18n.changeLanguage(newLang);
      localStorage.setItem("i18nextLng", newLang);
      setSelectedLang(newLang);

      const ref = doc(db, "users", user.uid);
      try {
        await updateDoc(ref, { "settings.defaultLanguage": newLang });
      } catch (err) {
        if (err?.code === "not-found" || err?.message?.includes("No document")) {
          await setDoc(ref, { settings: { defaultLanguage: newLang } }, { merge: true });
        } else {
          throw err;
        }
      }
      toast({ description: t("settings.toasts.lang_updated"), status: "success", duration: 2500 });
    } catch (err) {
      const msg =
        err?.code === "permission-denied"
          ? t("settings.toasts.firestore_perm_denied")
          : err?.message || t("settings.toasts.update_error");
      toast({ description: msg, status: "error", duration: 4000 });
    }
  };

  // ✅ Stripe customer portal via base centralisée
  const openStripePortal = async () => {
    if (!user?.uid) {
      toast({ description: t("errors.not_logged_in") || "User not logged in.", status: "warning" });
      return;
    }
    if (!hasStripeCustomer) {
      toast({ description: "Votre compte n’est pas encore lié à Stripe (stripeCustomerId manquant).", status: "warning" });
      return;
    }
    setStripeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/payments/create-stripe-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: user.uid,
          returnUrl: `${window.location.origin}/settings`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      if (data?.url) window.location.href = data.url;
      else toast({ description: t("settings.toasts.stripe_url_error"), status: "error" });
    } catch {
      toast({ description: t("settings.toasts.stripe_comm_error"), status: "error", duration: 4000, isClosable: true });
    } finally { setStripeLoading(false); }
  };

  const onNotif = (name) => (e) => setNotifications((p) => ({ ...p, [name]: e.target.checked }));

  if (!user) {
    return (<Box p={8}><HStack spacing={3}><Spinner /><Text>{t("common.loading","Chargement…")}</Text></HStack></Box>);
  }

  return (
    <Box p={8} maxW="800px" mx="auto">
      <Heading as="h1" size="xl" mb={6}>{t("settings.title")}</Heading>

      {/* Langue + dark mode */}
      <Box mb={8}>
        <Heading as="h2" size="lg" mb={4}>{t("settings.sections.language")}</Heading>
        <FormControl display="flex" alignItems="center" gap={8}>
          <Box maxW="260px" w="full">
            <FormLabel mb="1">{t("settings.fields.default_language")}</FormLabel>
            <Select value={selectedLang} onChange={handleLangChange}>
              <option value="fr">Français</option><option value="en">English</option>
              <option value="de">Deutsch</option><option value="it">Italiano</option>
              <option value="es">Español</option><option value="ru">Русский</option>
              <option value="ar">العربية</option>
            </Select>
          </Box>
          <FormControl maxW="220px" display="flex" alignItems="center">
            <FormLabel htmlFor="dm" mb="0">{t("settings.fields.dark_mode")}</FormLabel>
            <Switch id="dm" isChecked={colorMode === "dark"} onChange={toggleColorMode} colorScheme="blue" />
          </FormControl>
        </FormControl>
      </Box>

      <Divider mb={8} />

      {/* Notifications */}
      <Box mb={8}>
        <Heading as="h2" size="lg" mb={4}>{t("settings.sections.email_notifications")}</Heading>
        <VStack align="start">
          <Checkbox isChecked={notifications.reminders} onChange={onNotif("reminders")} colorScheme="blue">
            {t("settings.fields.reminders")}
          </Checkbox>
          <Checkbox isChecked={notifications.newsletter} onChange={onNotif("newsletter")} colorScheme="blue">
            {t("settings.fields.newsletter")}
          </Checkbox>
        </VStack>
      </Box>

      <Divider mb={8} />

      {/* Abonnement / Stripe */}
      <Box mb={8}>
        <Heading as="h2" size="lg" mb={2}>{t("settings.sections.subscription")}</Heading>
        <HStack spacing={3} mb={3}>
          <Badge colorScheme={subBadge.color}>{subBadge.label}</Badge>
          {user?.hasActiveSubscription ? <Badge colorScheme="green">ACCÈS ACTIF</Badge> : <Badge colorScheme="gray">ANNULÉ / INACTIF</Badge>}
        </HStack>

        {hasStripeCustomer && (
          <Text fontSize="xs" color="gray.500" mb={4}>
            Client Stripe : {stripeCustomerId}{stripeSubscriptionId ? ` • Abonnement : ${stripeSubscriptionId}` : ""}
          </Text>
        )}

        <Text mb={4}>{t("settings.subscription_hint")}</Text>
        <Button colorScheme="blue" borderRadius="xl" fontWeight="bold"
          onClick={openStripePortal} isLoading={stripeLoading}
          loadingText="Connexion à Stripe…" isDisabled={!hasStripeCustomer}>
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
        <Heading as="h2" size="lg" mb={4}>{t("settings.sections.security")}</Heading>
        <Text mb={4}>{t("settings.reset_hint")}</Text>
        <Button colorScheme="blue" isLoading={sendingReset}
          onClick={async () => {
            setSendingReset(true);
            try {
              await resetPassword(user.email, selectedLang || "fr");
              toast({ description: t("settings.toasts.reset_sent"), status: "success", duration: 2500 });
            } catch {
              toast({ description: t("settings.toasts.reset_error"), status: "error", duration: 3000 });
            } finally { setSendingReset(false); }
          }}>
          {t("settings.buttons.send_reset")}
        </Button>
      </Box>

      {/* Danger zone */}
      <Box>
        <Heading as="h2" size="lg" mb={4} color="red.500">{t("settings.sections.danger_zone")}</Heading>
        <Text mb={4}>{t("settings.delete_hint")}</Text>
        <Button colorScheme="red" variant="outline" onClick={onOpen}>{t("settings.buttons.delete_account")}</Button>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("settings.modal.confirm_title")}</ModalHeader>
          <ModalBody>{t("settings.modal.confirm_body")}</ModalBody>
          <ModalFooter>
            <Button mr={3} onClick={onClose}>{t("common.cancel")}</Button>
            <Button colorScheme="red" onClick={() => { onClose(); toast({ description: t("settings.toasts.account_deleted"), status: "info" }); }}>
              {t("actions.delete")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

