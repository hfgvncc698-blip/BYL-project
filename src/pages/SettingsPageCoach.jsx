// src/pages/SettingsPageCoach.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  Select,
  FormControl,
  FormLabel,
  Input,
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
import {
  MdLanguage,
  MdOutlineBadge,
  MdOutlineCreditCard,
  MdOutlineLock,
  MdOutlineSettings,
  MdOutlineWarningAmber,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import TutorialSettingsPanel from "../components/TutorialSettingsPanel";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";

import { getApiBase } from "../utils/apiBase";
import { getAuthHeaders } from "../utils/authHeaders";
import { canUseNavbarBranding } from "../utils/proPlanAccess";
import { ensureLanguageLoaded } from "../i18n";

const API_BASE = getApiBase();
const SUPPORTED = ["fr", "en", "de", "it", "es", "ru", "ar"];
const normalize = (lng) => (lng || "fr").split("-")[0].toLowerCase();
const withTimeout = (promise, ms = 25000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      globalThis.setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);

export default function SettingsPageCoach() {
  const { user, resetPassword } = useAuth();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t, i18n } = useTranslation("common");
  const theme = useAppTheme();

  const [sendingReset, setSendingReset] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [savingNavbarBrand, setSavingNavbarBrand] = useState(false);
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
  const [navbarBrandName, setNavbarBrandName] = useState(
    user?.settings?.navbarBrandName || user?.companyName || user?.businessName || ""
  );
  const navbarBrandDirtyRef = useRef(false);
  const navbarBrandInputRef = useRef(null);

  useEffect(() => {
    const lng = normalize(i18n.language);
    if (SUPPORTED.includes(lng)) setSelectedLang(lng);
  }, [i18n.language]);

  useEffect(() => {
    if (navbarBrandDirtyRef.current || savingNavbarBrand) return;
    const nextName = user?.settings?.navbarBrandName || user?.companyName || user?.businessName || "";
    setNavbarBrandName(nextName);
    if (navbarBrandInputRef.current) {
      navbarBrandInputRef.current.value = nextName;
    }
  }, [savingNavbarBrand, user?.settings?.navbarBrandName, user?.companyName, user?.businessName]);

  const subStatus = user?.subscriptionStatus || "canceled";
  const hasStripeCustomer = Boolean(user?.stripeCustomerId || user?.stripe?.customerId);
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
  const planModules = user?.proAccess?.modules || user?.modules;
  const hasNutritionAccess = Boolean(user?.role === "admin");
  const hasSportAccess = Boolean(
    user?.role === "admin" ||
      user?.sportAccess ||
      user?.hasSportAccess ||
      (Array.isArray(planModules) && planModules.includes("sport")) ||
      planModules?.sport ||
      user?.features?.sport ||
      ["sport", "complete", "club"].includes(user?.packageKey)
  );
  const isClubMember = user?.accountType === "club_member" && user?.clubRole !== "owner";
  const nutritionOnly = hasNutritionAccess && !hasSportAccess;
  const mixedAccess = hasNutritionAccess && hasSportAccess;
  const roleLabel =
    user?.role === "admin"
      ? "Admin"
      : nutritionOnly
        ? t("auto.SettingsPageCoach.role_nutrition", "Nutrition")
        : mixedAccess
          ? t("auto.SettingsPageCoach.role_mixed", "Mixte")
        : user?.role === "coach"
          ? t("auto.SettingsPageCoach.role_sport", "Sport")
          : t("auto.SettingsPageCoach.compte", "Compte");
  const workspaceLabel = nutritionOnly
    ? t("auto.SettingsPageCoach.workspace_nutrition", "Espace nutrition")
    : mixedAccess
      ? t("auto.SettingsPageCoach.workspace_mixed", "Espace sport + nutrition")
      : t("auto.SettingsPageCoach.workspace_professional", "Espace professionnel");
  const settingsIntro = nutritionOnly
    ? t("auto.SettingsPageCoach.settings_intro_nutrition", "Gérez votre langue, votre abonnement, votre sécurité et les préférences sensibles de votre espace nutrition.")
    : mixedAccess
      ? t("auto.SettingsPageCoach.settings_intro_mixed", "Gérez votre langue, votre abonnement, votre sécurité et les préférences sensibles de votre espace sport + nutrition.")
    : t("auto.SettingsPageCoach.settings_intro_professional", "Gérez votre langue, votre abonnement, votre sécurité et les préférences sensibles de votre espace professionnel.");
  const languageHint = nutritionOnly
    ? t("auto.SettingsPageCoach.language_hint_nutrition", "Choisissez la langue utilisée dans tout votre espace nutrition.")
    : mixedAccess
      ? t("auto.SettingsPageCoach.language_hint_mixed", "Choisissez la langue utilisée dans tout votre espace sport + nutrition.")
    : t("auto.SettingsPageCoach.language_hint_professional", "Choisissez la langue utilisée dans tout votre espace professionnel.");
  const accessTitle =
    subStatus === "active"
      ? t("auto.SettingsPageCoach.access_active", "Actif")
      : subStatus === "trialing"
        ? t("auto.SettingsPageCoach.access_trial", "Essai")
        : subStatus === "past_due"
          ? t("auto.SettingsPageCoach.access_payment", "Paiement")
          : t("auto.SettingsPageCoach.access_inactive", "Inactif");
  const accessHelper =
    subStatus === "trialing" && formattedTrialEnd
      ? t("auto.SettingsPageCoach.access_until", "Jusqu'au {{date}}", { date: formattedTrialEnd })
      : subStatus === "active"
        ? t("auto.SettingsPageCoach.access_pro_open", "Accès pro ouvert")
        : subStatus === "past_due"
          ? t("auto.SettingsPageCoach.access_action_required", "Action requise")
        : t("auto.SettingsPageCoach.access_to_reactivate", "À réactiver");
  const nutritionTutorialHiddenShortcutIds = nutritionOnly
    ? ["coachProgramList", "coachPrograms"]
    : hasNutritionAccess
      ? []
      : ["coachNutrition"];
  const nutritionTutorialLabelOverrides = nutritionOnly
    ? { coachClients: t("guidedTutorial.shortcuts.patients", "Patients") }
    : {};
  const tutorialRole = user?.accountType === "club_owner" || user?.clubRole === "owner" ? "club" : "coach";
  const navbarBrandAllowed = !isClubMember && canUseNavbarBranding(
    user?.proAccess || {
      packageKey: user?.packageKey,
      packageTier: user?.packageTier,
      branding: user?.branding,
    }
  );

  const subBadge = useMemo(() => {
    if (subStatus === "active") return { color: "green", label: t("auto.SettingsPageCoach.acces_actif", "ACCÈS ACTIF") };
    if (subStatus === "trialing") return { color: "yellow", label: t("auto.SettingsPageCoach.trial_in_progress", "ESSAI EN COURS") };
    if (subStatus === "past_due") return { color: "orange", label: t("auto.SettingsPageCoach.payment_late", "PAIEMENT EN RETARD") };
    if (subStatus === "canceled") return { color: "gray", label: t("auto.SettingsPageCoach.annule_inactif", "ANNULÉ / INACTIF") };
    if (subStatus === "club_active") return { color: "green", label: t("auto.SettingsPageCoach.club_active", "ACCÈS CLUB") };
    return { color: "gray", label: t(`auto.SettingsPageCoach.status_${subStatus}`, subStatus.toUpperCase()) };
  }, [subStatus, t]);

  const handleLangChange = async (e) => {
    if (!user?.uid) return;
    const newLang = normalize(e.target.value || "fr");
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

  const handleNavbarBrandSave = async () => {
    if (!user?.uid || !navbarBrandAllowed) return;
    const cleanName = String(navbarBrandInputRef.current?.value ?? navbarBrandName)
      .trim()
      .slice(0, 48);
    setSavingNavbarBrand(true);

    try {
      const ref = doc(db, "users", user.uid);
      try {
        await withTimeout(updateDoc(ref, { "settings.navbarBrandName": cleanName }));
      } catch (err) {
        if (err?.code === "not-found" || err?.message?.includes("No document")) {
          await withTimeout(setDoc(ref, { settings: { navbarBrandName: cleanName } }, { merge: true }));
        } else {
          throw err;
        }
      }
      setNavbarBrandName(cleanName);
      if (navbarBrandInputRef.current) {
        navbarBrandInputRef.current.value = cleanName;
      }
      navbarBrandDirtyRef.current = false;
      notify(toast, "settingsSaved", {
        description: "Nom affiché dans la navigation mis à jour.",
      });
    } catch (err) {
      if (err?.message === "timeout") {
        toast({
          status: "warning",
          title: t("auto.SettingsPageCoach.synchronisation_lente", "Synchronisation lente"),
          description: t("auto.SettingsPageCoach.firebase_n_a_pas_confirme_l_enregistrement_as", "Firebase n'a pas confirmé l'enregistrement assez vite. La connexion ou le service peut être lent, réessayez dans quelques secondes."),
          duration: 6500,
          isClosable: true,
        });
        return;
      }
      notify(toast, "saveError", {
        description: err?.message || "Impossible d'enregistrer ce nom pour le moment.",
      });
    } finally {
      setSavingNavbarBrand(false);
    }
  };

  const openStripePortal = async () => {
    if (isClubMember) {
      toast({
        title: t("auto.SettingsPageCoach.gere_par_le_club", "Géré par le club"),
        description: t("auto.SettingsPageCoach.l_abonnement_stripe_est_administre_par_le_res", "L’abonnement Stripe est administré par le responsable du club."),
        status: "info",
        duration: 4500,
        isClosable: true,
      });
      return;
    }
    if (!user?.uid) {
      toast({
        description: t("errors.not_logged_in") || "User not logged in.",
        status: "warning",
      });
      return;
    }
    if (!hasStripeCustomer) {
      toast({
        description: t("auto.SettingsPageCoach.votre_compte_n_est_pas_encore_lie_a_stripe_st", "Votre compte n’est pas encore lié à Stripe (stripeCustomerId manquant)."),
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
    <Box data-tour-page="settings" p={{ base: 4, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
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
                  {settingsIntro}
                </Text>
              </Box>
            </HStack>

            <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3} w={{ base: "100%", xl: "520px" }}>
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>{t("auto.SettingsPageCoach.langue_active", "Langue active")}</Text>
                <Text mt={2} fontSize="xl" fontWeight="800" color={textColor}>{selectedLang.toUpperCase()}</Text>
                <Text mt={1} fontSize="sm" color={subtleText}>{t("auto.SettingsPageCoach.preference_enregistree", "Préférence enregistrée")}</Text>
              </Box>
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>{t("auto.SettingsPageCoach.compte", "Compte")}</Text>
                <Text mt={2} fontSize="xl" fontWeight="800" color={textColor}>{roleLabel}</Text>
                <Text mt={1} fontSize="sm" color={subtleText}>{workspaceLabel}</Text>
              </Box>
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>{t("auto.SettingsPageCoach.acces", "Accès")}</Text>
                <Text mt={2} fontSize="xl" fontWeight="800" color={textColor}>{accessTitle}</Text>
                <Text mt={1} fontSize="sm" color={subtleText}>{accessHelper}</Text>
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
                  {languageHint}
                </Text>
              </Box>
            </HStack>

            <FormControl maxW={{ base: "100%", md: "280px" }}>
              <FormLabel mb="1" color={subtleText}>
                {t("settings.fields.default_language") || "Langue"}
              </FormLabel>
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

          <SurfaceCard p={{ base: 5, md: 6 }}>
            <HStack spacing={3} mb={4} align="flex-start">
              <Circle size="42px" bg="rgba(139,92,246,0.10)" color="#8B5CF6" flexShrink={0}>
                <Icon as={MdOutlineBadge} boxSize="20px" />
              </Circle>
              <Box minW={0}>
                <HStack spacing={2} wrap="wrap">
                  <Heading as="h2" size="md" color={textColor}>{t("auto.SettingsPageCoach.nom_dans_la_navigation", "Nom dans la navigation")}</Heading>
                  <Badge borderRadius="full" colorScheme={navbarBrandAllowed ? "green" : "gray"}>
                    {navbarBrandAllowed
                      ? t("auto.SettingsPageCoach.inclus", "Inclus")
                      : t("auto.SettingsPageCoach.palier_superieur", "Palier supérieur")}
                  </Badge>
                </HStack>
                <Text mt={1} color={mutedText}>
                  {isClubMember
                    ? t("auto.SettingsPageCoach.nom_gere_par_responsable_club", "Ce nom est géré par le responsable du club.")
                    : t("auto.SettingsPageCoach.navbar_brand_hint", "Sur les paliers avancés, ce nom remplace BoostYourLife.coach dans la barre de navigation.")}
                </Text>
              </Box>
            </HStack>

            <Stack spacing={3}>
              <FormControl isDisabled={!navbarBrandAllowed}>
                <FormLabel mb="1" color={subtleText}>{t("auto.SettingsPageCoach.nom_affiche", "Nom affiché")}</FormLabel>
                <Input
                  ref={navbarBrandInputRef}
                  defaultValue={navbarBrandName}
                  onChange={() => {
                    navbarBrandDirtyRef.current = true;
                  }}
                  maxLength={48}
                  placeholder={t("auto.SettingsPageCoach.nom_prenom_ou_cabinet", "Nom, prénom ou cabinet")}
                  borderRadius="full"
                  bg={subCardBg}
                />
              </FormControl>
              <Button
                alignSelf="flex-start"
                bg="#0F172A"
                color="white"
                _hover={{ bg: "#111827" }}
                borderRadius="full"
                isDisabled={!navbarBrandAllowed}
                isLoading={savingNavbarBrand}
                onClick={handleNavbarBrandSave}
              >{t("auto.SettingsPageCoach.enregistrer_le_nom", "Enregistrer le nom")}</Button>
            </Stack>
          </SurfaceCard>

          <TutorialSettingsPanel
            role={tutorialRole}
            cardBg={cardBg}
            borderColor={borderStrong}
            textColor={textColor}
            mutedText={mutedText}
            hiddenShortcutIds={tutorialRole === "club" ? [] : nutritionTutorialHiddenShortcutIds}
            shortcutLabelOverrides={nutritionTutorialLabelOverrides}
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
              {user?.hasActiveSubscription ? (
                <Badge borderRadius="full" px={3} py={1} colorScheme="green">{t("auto.SettingsPageCoach.acces_actif", "ACCÈS ACTIF")}</Badge>
              ) : (
                <Badge borderRadius="full" px={3} py={1}>{t("auto.SettingsPageCoach.annule_inactif", "ANNULÉ / INACTIF")}</Badge>
              )}
            </HStack>

            {isClubMember ? (
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontWeight="800" color={textColor}>{t("auto.SettingsPageCoach.abonnement_gere_par_le_club", "Abonnement géré par le club")}</Text>
                <Text mt={1} color={mutedText} fontSize="sm">{t("auto.SettingsPageCoach.les_factures_le_portail_stripe_le_logo_du_clu", "Les factures, le portail Stripe, le logo du club et les capacités sont administrés par le responsable de la structure.")}</Text>
              </Box>
            ) : (
              <Button
                bg="#0F172A"
                color="white"
                _hover={{ bg: "#111827" }}
                borderRadius="full"
                fontWeight="700"
                onClick={openStripePortal}
                isLoading={stripeLoading}
                loadingText={t("autoQ.connectingStripe", "Connexion à Stripe…")}
                isDisabled={!hasStripeCustomer}
              >
                {t("settings.buttons.open_stripe_portal")}
              </Button>
            )}
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
                <Text fontSize="sm" color={mutedText}>{t("auto.SettingsPageCoach.adresse_utilisee", "Adresse utilisée")}</Text>
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
