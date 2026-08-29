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
  MdOutlineWarningAmber,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import PageBackButton from "../components/ui/PageBackButton";
import { AppSectionHeader, AppSurface } from "../components/ui/AppPrimitives";
import TutorialSettingsPanel from "../components/TutorialSettingsPanel";
import EmailNotificationPreferenceCard from "../components/EmailNotificationPreferenceCard";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";

import { getApiBase } from "../utils/apiBase";
import { getAuthHeaders } from "../utils/authHeaders";
import { canUseNavbarBranding, hasPlanModule } from "../utils/proPlanAccess";
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

  const initialLang =
    user?.settings?.defaultLanguage ||
    user?.preferredLang ||
    normalize(i18n.resolvedLanguage) ||
    "fr";
  const [selectedLang, setSelectedLang] = useState(initialLang);
  const [navbarBrandName, setNavbarBrandName] = useState(
    user?.settings?.navbarBrandName || ""
  );
  const navbarBrandDirtyRef = useRef(false);
  const navbarBrandInputRef = useRef(null);

  useEffect(() => {
    const lng = normalize(i18n.language);
    if (SUPPORTED.includes(lng)) setSelectedLang(lng);
  }, [i18n.language]);

  useEffect(() => {
    if (navbarBrandDirtyRef.current || savingNavbarBrand) return;
    const nextName = user?.settings?.navbarBrandName || "";
    setNavbarBrandName(nextName);
    if (navbarBrandInputRef.current) {
      navbarBrandInputRef.current.value = nextName;
    }
  }, [savingNavbarBrand, user?.settings?.navbarBrandName]);

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
  const hasNutritionAccess = hasPlanModule(user, "nutrition");
  const hasSportAccess = hasPlanModule(user, "sport");
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
              subtitle={settingsIntro}
              headingAs="h1"
            />
          </Flex>
        </AppSurface>

        <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={{ base: 2.5, md: 3 }}>
          <MetricTile
            label={t("auto.SettingsPageCoach.langue_active", "Langue active")}
            helper={t("auto.SettingsPageCoach.preference_enregistree", "Préférence enregistrée")}
            value={selectedLang.toUpperCase()}
          />
          <MetricTile
            label={t("auto.SettingsPageCoach.compte", "Compte")}
            helper={workspaceLabel}
            value={roleLabel}
          />
          <MetricTile
            label={t("auto.SettingsPageCoach.acces", "Accès")}
            helper={accessHelper}
            value={accessTitle}
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

            <Flex direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "flex-end" }} gap={3}>
              <FormControl isDisabled={!navbarBrandAllowed} flex="1">
                <FormLabel mb="1" color={subtleText}>{t("auto.SettingsPageCoach.nom_affiche", "Nom affiché")}</FormLabel>
                <Input
                  ref={navbarBrandInputRef}
                  defaultValue={navbarBrandName}
                  onChange={() => {
                    navbarBrandDirtyRef.current = true;
                  }}
                  maxLength={48}
                  placeholder="BoostYourLife.coach"
                  borderRadius="full"
                  bg={subCardBg}
                />
              </FormControl>
              <Button
                alignSelf={{ base: "stretch", md: "flex-end" }}
                bg={primaryButtonBg}
                color={primaryButtonColor}
                _hover={{ bg: primaryButtonHoverBg }}
                borderRadius="full"
                h="40px"
                px={5}
                fontWeight="700"
                isDisabled={!navbarBrandAllowed}
                isLoading={savingNavbarBrand}
                onClick={handleNavbarBrandSave}
              >{t("auto.SettingsPageCoach.enregistrer_le_nom", "Enregistrer le nom")}</Button>
            </Flex>
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

            {isClubMember ? (
              <Box bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontWeight="800" color={textColor}>{t("auto.SettingsPageCoach.abonnement_gere_par_le_club", "Abonnement géré par le club")}</Text>
                <Text mt={1} color={mutedText} fontSize="sm">{t("auto.SettingsPageCoach.les_factures_le_portail_stripe_le_logo_du_clu", "Les factures, le portail Stripe, le logo du club et les capacités sont administrés par le responsable de la structure.")}</Text>
              </Box>
            ) : (
              <Flex direction={{ base: "column", sm: "row" }} justify="space-between" align={{ base: "stretch", sm: "center" }} gap={3}>
                <Badge alignSelf={{ base: "flex-start", sm: "center" }} borderRadius="full" px={3} py={1} colorScheme={subBadge.color}>
                  {subBadge.label}
                </Badge>
                <Button
                  bg={primaryButtonBg}
                  color={primaryButtonColor}
                  _hover={{ bg: primaryButtonHoverBg }}
                  borderRadius="full"
                  h="40px"
                  px={5}
                  fontWeight="700"
                  onClick={openStripePortal}
                  isLoading={stripeLoading}
                  loadingText={t("autoQ.connectingStripe", "Connexion à Stripe…")}
                  isDisabled={!hasStripeCustomer}
                >
                  {t("settings.buttons.open_stripe_portal")}
                </Button>
              </Flex>
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

            <Flex direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }} gap={4}>
              <Box flex="1" bg={subCardBg} border="1px solid" borderColor={borderColor} borderRadius="22px" p={4}>
                <Text fontSize="sm" color={mutedText}>{t("auto.SettingsPageCoach.adresse_utilisee", "Adresse utilisée")}</Text>
                <Text mt={1} fontWeight="700" color={textColor}>
                  {user.email}
                </Text>
              </Box>
              <Button
                bg={primaryButtonBg}
                color={primaryButtonColor}
                _hover={{ bg: primaryButtonHoverBg }}
                borderRadius="full"
                h="40px"
                px={5}
                fontWeight="800"
                alignSelf={{ base: "stretch", md: "center" }}
                minW={{ md: "280px" }}
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
            </Flex>
          </SurfaceCard>

          <SurfaceCard p={{ base: 5, md: 6 }}>
            <Flex direction={{ base: "column", sm: "row" }} justify="space-between" align={{ base: "stretch", sm: "center" }} gap={4}>
              <HStack spacing={3}>
                <Circle size="42px" bg="rgba(239,68,68,0.10)" color="#EF4444" flexShrink={0}>
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
                flexShrink={0}
                variant="outline"
                borderRadius="full"
                color="#EF4444"
                borderColor="rgba(239,68,68,0.32)"
                _hover={{ bg: "rgba(239,68,68,0.06)" }}
                onClick={onOpen}
              >
                {t("settings.buttons.delete_account")}
              </Button>
            </Flex>
          </SurfaceCard>
        </SimpleGrid>
      </VStack>

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
