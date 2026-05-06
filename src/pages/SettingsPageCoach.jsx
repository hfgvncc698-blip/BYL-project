// src/pages/SettingsPageCoach.jsx
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
  Spinner,
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
import {
  MdLanguage,
  MdOutlineCreditCard,
  MdOutlineLock,
  MdOutlineSettings,
  MdOutlineWarningAmber,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";

import { getApiBase } from "../utils/apiBase";
import { getAuthHeaders } from "../utils/authHeaders";

const API_BASE = getApiBase();
const SUPPORTED = ["fr", "en", "de", "it", "es", "ru", "ar"];
const normalize = (lng) => (lng || "fr").split("-")[0].toLowerCase();

export default function SettingsPageCoach() {
  const { user, resetPassword } = useAuth();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t, i18n } = useTranslation("common");
  const theme = useAppTheme();

  const [sendingReset, setSendingReset] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const pageBg = theme.pageBg;
  const cardBg = theme.surfaceBg;
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
  const heroGlow = useColorModeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.14)");
  const topGlow = useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.12)");
  const bottomGlow = useColorModeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.10)");

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
  const trialEndsAtValue = user?.trialEndsAt
    ? new Date(
        typeof user.trialEndsAt?.toDate === "function"
          ? user.trialEndsAt.toDate()
          : user.trialEndsAt
      )
    : null;
  const locale = normalize(i18n.resolvedLanguage || i18n.language || "fr");
  const formattedTrialEnd =
    trialEndsAtValue && !Number.isNaN(trialEndsAtValue.getTime())
      ? new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(trialEndsAtValue)
      : null;
  const roleLabel = user?.role === "admin" ? "Admin" : user?.role === "coach" ? "Coach" : "Compte";
  const accessTitle =
    subStatus === "active"
      ? "Actif"
      : subStatus === "trialing"
        ? "Essai"
        : subStatus === "past_due"
          ? "Paiement"
          : "Inactif";
  const accessHelper =
    subStatus === "trialing" && formattedTrialEnd
      ? `Jusqu'au ${formattedTrialEnd}`
      : subStatus === "active"
        ? "Accès pro ouvert"
        : subStatus === "past_due"
          ? "Action requise"
          : "À réactiver";

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

      notify(toast, "settingsSaved", {
        description: t("settings.toasts.lang_updated") || "Langue mise à jour.",
      });
    } catch (err) {
      const msg =
        err?.code === "permission-denied"
          ? t("settings.toasts.firestore_perm_denied") || "Permissions Firestore insuffisantes."
          : err?.message || t("settings.toasts.update_error") || "Erreur lors de la mise à jour.";
      notify(toast, "saveError", { description: msg });
    }
  };

  const openStripePortal = async () => {
    if (!user?.uid) {
      toast({
        description: t("errors.not_logged_in") || "User not logged in.",
        status: "warning",
      });
      return;
    }
    if (!hasStripeCustomer) {
      toast({
        description: "Votre compte n’est pas encore lié à Stripe (stripeCustomerId manquant).",
        status: "warning",
      });
      return;
    }

    setStripeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/payments/create-stripe-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({
          userId: user.uid,
          returnUrl: `${window.location.origin}/settings`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({
          description: t("settings.toasts.stripe_url_error") || "URL Stripe manquante.",
          status: "error",
        });
      }
    } catch {
      toast({
        description: t("settings.toasts.stripe_comm_error") || "Erreur de communication Stripe.",
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
    <Box
      bg={cardBg}
      borderRadius="28px"
      border="1px solid"
      borderColor={borderStrong}
      boxShadow={glassShadow}
      position="relative"
      overflow="hidden"
      {...props}
    >
      {children}
    </Box>
  );

  return (
    <Box p={{ base: 4, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
      <Box
        position="absolute"
        top="-120px"
        right="-90px"
        w="360px"
        h="360px"
        borderRadius="full"
        bg={topGlow}
        filter="blur(90px)"
        pointerEvents="none"
      />
      <Box
        position="absolute"
        bottom="-140px"
        left="-100px"
        w="340px"
        h="340px"
        borderRadius="full"
        bg={bottomGlow}
        filter="blur(90px)"
        pointerEvents="none"
      />

      <VStack maxW="980px" mx="auto" spacing={6} align="stretch" position="relative" zIndex={1}>
        <SurfaceCard p={{ base: 5, md: 6 }}>
          <Box
            position="absolute"
            top="-50px"
            right="-28px"
            w="220px"
            h="220px"
            borderRadius="full"
            bg={heroGlow}
            filter="blur(42px)"
          />
          <Flex position="relative" zIndex={1} direction={{ base: "column", xl: "row" }} justify="space-between" gap={5}>
            <HStack spacing={4} align="flex-start" flex="1">
              <Circle
                size={{ base: "58px", md: "64px" }}
                bg={subCardBg}
                border="1px solid"
                borderColor={borderColor}
                color={textColor}
                flexShrink={0}
              >
                <Icon as={MdOutlineSettings} boxSize="26px" />
              </Circle>
              <Box minW={0}>
                <Heading as="h1" size="lg" color={textColor} letterSpacing="-0.03em">
                  {t("settings.title")}
                </Heading>
                <Text mt={2} color={mutedText} maxW="60ch">
                  Gérez votre langue, votre abonnement, votre sécurité et les préférences sensibles de votre espace coach dans une interface plus claire.
                </Text>
              </Box>
            </HStack>

            <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3} w={{ base: "100%", xl: "440px" }}>
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>Langue active</Text>
                <Text mt={2} fontSize="xl" fontWeight="800" color={textColor}>{selectedLang.toUpperCase()}</Text>
                <Text mt={1} fontSize="sm" color={subtleText}>Préférence enregistrée</Text>
              </Box>
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>Compte</Text>
                <Text mt={2} fontSize="xl" fontWeight="800" color={textColor}>{roleLabel}</Text>
                <Text mt={1} fontSize="sm" color={subtleText}>Espace professionnel</Text>
              </Box>
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>Accès</Text>
                <Text mt={2} fontSize="xl" fontWeight="800" color={textColor}>{accessTitle}</Text>
                <Text mt={1} fontSize="sm" color={subtleText}>{accessHelper}</Text>
              </Box>
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>Stripe</Text>
                <Text mt={2} fontSize="xl" fontWeight="800" color={textColor}>
                  {hasStripeCustomer ? "Connecté" : "À relier"}
                </Text>
                <Text mt={1} fontSize="sm" color={subtleText}>
                  {hasStripeCustomer ? "Portail disponible" : "Aucun client Stripe"}
                </Text>
              </Box>
            </SimpleGrid>
          </Flex>
        </SurfaceCard>

        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
          <SurfaceCard p={{ base: 5, md: 6 }}>
            <HStack spacing={3} mb={4}>
              <Circle size="42px" bg="rgba(59,130,246,0.10)" color="#3B82F6">
                <Icon as={MdLanguage} boxSize="20px" />
              </Circle>
              <Box>
                <Heading as="h2" size="md" color={textColor}>
                  {t("settings.sections.language")}
                </Heading>
                <Text mt={1} color={mutedText}>
                  Choisissez la langue utilisée dans tout votre espace coach.
                </Text>
              </Box>
            </HStack>

            <FormControl maxW={{ base: "100%", md: "280px" }}>
              <FormLabel mb="1" color={subtleText}>
                {t("settings.fields.default_language") || "Langue"}
              </FormLabel>
              <Select value={selectedLang} onChange={handleLangChange} borderRadius="full" bg={subCardBg}>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="es">Español</option>
                <option value="ru">Русский</option>
                <option value="ar">العربية</option>
              </Select>
            </FormControl>
          </SurfaceCard>

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
              {user?.hasActiveSubscription ? (
                <Badge borderRadius="full" px={3} py={1} colorScheme="green">
                  ACCÈS ACTIF
                </Badge>
              ) : (
                <Badge borderRadius="full" px={3} py={1}>
                  ANNULÉ / INACTIF
                </Badge>
              )}
            </HStack>

            <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4} mb={4}>
              {hasStripeCustomer ? (
                <Text fontSize="sm" color={mutedText}>
                  Client Stripe : {stripeCustomerId}
                  {stripeSubscriptionId ? ` • Abonnement : ${stripeSubscriptionId}` : ""}
                </Text>
              ) : (
                <Text fontSize="sm" color="orange.400">
                  Votre compte n’est pas encore lié à Stripe.
                </Text>
              )}
            </Box>

            <Button
              bg="#0F172A"
              color="white"
              _hover={{ bg: "#111827" }}
              borderRadius="full"
              fontWeight="700"
              onClick={openStripePortal}
              isLoading={stripeLoading}
              loadingText="Connexion à Stripe…"
              isDisabled={!hasStripeCustomer}
            >
              {t("settings.buttons.open_stripe_portal")}
            </Button>
          </SurfaceCard>

          <SurfaceCard p={{ base: 5, md: 6 }}>
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
                <Text fontSize="sm" color={mutedText}>Adresse utilisée</Text>
                <Text mt={1} fontWeight="700" color={textColor}>
                  {user.email}
                </Text>
              </Box>
              <Button
                bg="#0F172A"
                color="white"
                _hover={{ bg: "#111827" }}
                borderRadius="full"
                isLoading={sendingReset}
                onClick={async () => {
                  setSendingReset(true);
                  try {
                    await resetPassword(user.email, selectedLang || "fr");
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

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="28px" bg={cardBg} border="1px solid" borderColor={borderStrong} boxShadow={glassShadow}>
          <ModalHeader>{t("settings.modal.confirm_title")}</ModalHeader>
          <ModalBody>{t("settings.modal.confirm_body")}</ModalBody>
          <ModalFooter>
            <Button mr={3} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              colorScheme="red"
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
