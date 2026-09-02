// src/pages/SettingsPageClient.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Heading,
  Select,
  FormControl,
  FormLabel,
  Button,
  Text,
  useToast,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Badge,
  HStack,
  VStack,
  Stack,
  useColorModeValue,
  Circle,
  Icon,
  Flex,
  SimpleGrid,
} from "@chakra-ui/react";
import { useAuth } from "../AuthContext";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../utils/api";
import {
  MdLanguage,
  MdOutlineCreditCard,
  MdOutlineLock,
  MdOutlineWarningAmber,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import PageBackButton from "../components/ui/PageBackButton";
import { AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives";
import TutorialSettingsPanel from "../components/TutorialSettingsPanel";
import EmailNotificationPreferenceCard from "../components/EmailNotificationPreferenceCard";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";
import { ensureLanguageLoaded } from "../i18n";

const SUPPORTED = ["fr", "en", "de", "it", "es", "ru", "ar"];
const normalizeLang = (lng) => (lng || "fr").split("-")[0].toLowerCase();

export default function SettingsPageClient() {
  const { user, resetPassword } = useAuth();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t, i18n } = useTranslation("common");
  const theme = useAppTheme();

  const [sendingReset, setSendingReset] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const pageBg = theme.pageBg;
  const cardBg = theme.surfaceBgStrong;
  const subCardBg = theme.surfaceSoft;
  const borderColor = theme.borderColor;
  const borderStrong = theme.borderStrong;
  const mutedText = theme.mutedText;
  const subtleText = theme.subtleText;
  const textColor = theme.textColor;
  const glassShadow = useColorModeValue(
    "0 20px 50px rgba(15,23,42,0.08)",
    "0 22px 60px rgba(0,0,0,0.34)"
  );
  const primaryButtonBg = useColorModeValue("#0F172A", "rgba(255,255,255,0.10)");
  const primaryButtonColor = useColorModeValue("white", "#F8FAFC");
  const primaryButtonHoverBg = useColorModeValue("#1E293B", "rgba(255,255,255,0.16)");

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

  // Stripe infos (affichage badges)
  const subStatus = user?.subscriptionStatus || "canceled";
  const hasStripeCustomer = Boolean(
    user?.stripeCustomerId || user?.stripe?.customerId
  );

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
      await ensureLanguageLoaded(newLang);
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

      notify(toast, "settingsSaved", {
        description: t("settings.toasts.lang_updated"),
      });
    } catch (err) {
      const msg =
        err?.code === "permission-denied"
          ? t("settings.toasts.firestore_perm_denied")
          : err?.message || t("settings.toasts.update_error");
      notify(toast, "saveError", { description: msg });
    }
  };

  // ---- Stripe customer portal (via apiFetch) ----
  const handleOpenStripePortal = async () => {
    if (!user?.uid) {
      toast({
        description: t("errors.not_logged_in") || "User not logged in.",
        status: "warning",
      });
      return;
    }
    if (!hasStripeCustomer) {
      toast({
        description: t("auto.SettingsPageClient.votre_compte_n_est_pas_encore_lie_a_stripe_st", "Votre compte n’est pas encore lié à Stripe (stripeCustomerId manquant)."),
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
      if (data?.url) window.location.href = data.url;
      else toast({ description: t("settings.toasts.stripe_url_error"), status: "error" });
    } catch {
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

  if (!user) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  const SurfaceCard = ({ children, ...props }) => (
    <AppSurface
      bg={cardBg}
      borderRadius="22px"
      border="1px solid"
      borderColor={borderStrong}
      boxShadow={glassShadow}
      position="relative"
      overflow="hidden"
      {...props}
    >
      {children}
    </AppSurface>
  );

  const MetricTile = ({ label, value, helper }) => (
    <AppSurface variant="tile" bg={cardBg} borderRadius="18px" p={{ base: 3.5, md: 4 }} minH="92px">
      <HStack justify="space-between" align="center" gap={4}>
        <Box minW={0}>
          <Text fontSize="sm" color={mutedText} fontWeight="900" lineHeight="1.2" noOfLines={1}>
            {label}
          </Text>
          {helper ? (
            <Text mt={1} fontSize="xs" color={subtleText} lineHeight="1.3" noOfLines={2}>
              {helper}
            </Text>
          ) : null}
        </Box>
        <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="950" letterSpacing="-0.04em" color={textColor} flexShrink={0}>
          {value}
        </Text>
      </HStack>
    </AppSurface>
  );

  return (
    <Box data-tour-page="settings" p={{ base: 3, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
      <VStack maxW="1120px" mx="auto" spacing={{ base: 3.5, md: 6 }} align="stretch" position="relative" zIndex={1}>
        <AppSurface p={{ base: 4, md: 5 }}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton />
            <AppSectionHeader
              flex="1"
              title={t("settings.title")}
              subtitle={t("auto.SettingsPageClient.gerez_votre_langue_votre_acces_votre_securite", "Gérez votre langue, votre accès, votre sécurité et les préférences de votre compte dans un espace plus clair et plus simple.")}
              headingAs="h1"
            />
          </Flex>
        </AppSurface>

        <SimpleGrid data-tour="settings-summary" columns={{ base: 1, sm: 3 }} spacing={{ base: 2.5, md: 3 }}>
          <MetricTile
            label={t("auto.SettingsPageClient.langue_active", "Langue active")}
            helper={t("settings.fields.default_language", "Langue par défaut")}
            value={selectedLang.toUpperCase()}
          />
          <MetricTile
            label={t("clientsList.table.subscription", "Abonnement")}
            helper={t("settings.subscription_hint")}
            value={subStatus === "active" ? "Actif" : subStatus === "trialing" ? "Essai" : "Inactif"}
          />
          <MetricTile
            label={t("settings.sections.security", "Sécurité")}
            helper={t("auto.SettingsPageClient.adresse_utilisee", "Adresse utilisée")}
            value={t("clientCreation.email", "Email")}
          />
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={{ base: 3.5, md: 6 }}>
          <SurfaceCard p={{ base: 5, md: 6 }}>
            <HStack spacing={3} mb={4}>
              <Circle size="42px" bg="rgba(59,130,246,0.10)" color="#3B82F6">
                <Icon as={MdLanguage} boxSize="20px" />
              </Circle>
              <Box>
                <Heading as="h2" size="md" color={textColor}>
                  {t("settings.sections.language")}
                </Heading>
                <Text mt={1} color={mutedText}>{t("auto.SettingsPageClient.choisissez_la_langue_utilisee_dans_tout_votre", "Choisissez la langue utilisée dans tout votre espace client.")}</Text>
              </Box>
            </HStack>

            <FormControl maxW={{ base: "100%", md: "280px" }}>
              <FormLabel mb="1" color={subtleText}>{t("settings.fields.default_language")}</FormLabel>
              <Select value={selectedLang} onChange={handleLangChange} borderRadius="full" bg={subCardBg}>
                <option value="fr">{t("clientCreation.languages.fr", "Français")}</option>
                <option value="en">{t("clientCreation.languages.en", "English")}</option>
                <option value="de">{t("clientCreation.languages.de", "Deutsch")}</option>
                <option value="it">{t("clientCreation.languages.it", "Italiano")}</option>
                <option value="es">{t("clientCreation.languages.es", "Español")}</option>
                <option value="ru">{t("clientCreation.languages.ru", "Русский")}</option>
                <option value="ar">العربية</option>
              </Select>
            </FormControl>
          </SurfaceCard>

          <EmailNotificationPreferenceCard
            surfaceProps={{
              bg: cardBg,
              borderRadius: "22px",
              border: "1px solid",
              borderColor: borderStrong,
              boxShadow: glassShadow,
              position: "relative",
              overflow: "hidden",
            }}
            textColor={textColor}
            mutedText={mutedText}
            borderColor={borderColor}
            softBg={subCardBg}
          />

          <TutorialSettingsPanel
            role="client"
            cardBg={cardBg}
            borderColor={borderStrong}
            textColor={textColor}
            mutedText={mutedText}
          />

          <SurfaceCard p={{ base: 5, md: 6 }}>
            <HStack spacing={3} mb={4}>
              <Circle size="42px" bg="rgba(16,185,129,0.10)" color="#10B981">
                <Icon as={MdOutlineCreditCard} boxSize="20px" />
              </Circle>
              <Box>
                <Heading as="h2" size="md" color={textColor}>
                  {t("settings.sections.subscription")}
                </Heading>
                <Text mt={1} color={mutedText}>
                  {t("settings.subscription_hint")}
                </Text>
              </Box>
            </HStack>

            <HStack spacing={3} mb={4} wrap="wrap">
              <Badge borderRadius="full" px={3} py={1} colorScheme={subBadge.color}>
                {subBadge.label}
              </Badge>
            </HStack>

            <Button
              bg={primaryButtonBg}
              color={primaryButtonColor}
              _hover={{ bg: primaryButtonHoverBg }}
              borderRadius="full"
              h="40px"
              px={5}
              fontWeight="700"
              onClick={handleOpenStripePortal}
              isLoading={stripeLoading}
              loadingText={t("autoQ.connectingStripe", "Connexion à Stripe…")}
              isDisabled={!hasStripeCustomer}
            >
              {t("settings.buttons.open_stripe_portal")}
            </Button>
          </SurfaceCard>

          <SurfaceCard data-tour="settings-security" p={{ base: 5, md: 6 }}>
            <HStack spacing={3} mb={4}>
              <Circle size="42px" bg="rgba(59,130,246,0.10)" color="#3B82F6">
                <Icon as={MdOutlineLock} boxSize="20px" />
              </Circle>
              <Box>
                <Heading as="h2" size="md" color={textColor}>
                  {t("settings.sections.security")}
                </Heading>
                <Text mt={1} color={mutedText}>
                  {t("settings.reset_hint")}
                </Text>
              </Box>
            </HStack>

            <Stack spacing={4}>
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>{t("auto.SettingsPageClient.adresse_utilisee", "Adresse utilisée")}</Text>
                <Text mt={1} fontWeight="700" color={textColor}>{user.email}</Text>
              </Box>
              <Button
                bg={primaryButtonBg}
                color={primaryButtonColor}
                _hover={{ bg: primaryButtonHoverBg }}
                borderRadius="full"
                h="40px"
                px={5}
                fontWeight="800"
                alignSelf={{ base: "stretch", sm: "flex-start" }}
                minW={{ sm: "280px" }}
                isLoading={sendingReset}
                onClick={async () => {
                  setSendingReset(true);
                  try {
                    const langForEmail = selectedLang || "fr";
                    await resetPassword(user.email, langForEmail);
                    notify(toast, "resetSent", {
                      description: t("settings.toasts.reset_sent"),
                    });
                  } catch {
                    notify(toast, "saveError", {
                      title: "E-mail impossible",
                      description: t("settings.toasts.reset_error"),
                    });
                  } finally {
                    setSendingReset(false);
                  }
                }}
              >
                {t("settings.buttons.send_reset")}
              </Button>
            </Stack>
          </SurfaceCard>

          <SurfaceCard p={{ base: 5, md: 6 }}>
            <HStack spacing={3} mb={4}>
              <Circle size="42px" bg="rgba(239,68,68,0.10)" color="#EF4444">
                <Icon as={MdOutlineWarningAmber} boxSize="20px" />
              </Circle>
              <Box>
                <Heading as="h2" size="md" color="#EF4444">
                  {t("settings.sections.danger_zone")}
                </Heading>
                <Text mt={1} color={mutedText}>
                  {t("settings.delete_hint")}
                </Text>
              </Box>
            </HStack>

            <Button
              variant="outline"
              borderRadius="full"
              color="#EF4444"
              borderColor="rgba(239,68,68,0.32)"
              _hover={{ bg: "rgba(239,68,68,0.06)" }}
              onClick={onOpen}
            >
              {t("settings.buttons.delete_account")}
            </Button>
          </SurfaceCard>
        </SimpleGrid>
      </VStack>

      {/* Confirmation suppression */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="22px" bg={cardBg} border="1px solid" borderColor={borderStrong} boxShadow={glassShadow}>
          <ModalHeader>{t("settings.modal.confirm_title")}</ModalHeader>
          <ModalBody>{t("settings.modal.confirm_body")}</ModalBody>
          <ModalFooter>
            <Button mr={3} variant="outline" borderRadius="full" h="40px" px={5} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              colorScheme="red"
              borderRadius="full"
              h="40px"
              px={5}
              onClick={() => {
                onClose();
                toast({
                  description: t("settings.toasts.account_deleted"),
                  status: "info",
                });
              }}
            >
              {t("actions.delete")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
