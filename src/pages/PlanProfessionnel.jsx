// src/pages/PlanProfessionnel.jsx
import React, { useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Heading,
  HStack,
  Icon,
  SimpleGrid,
  Stack,
  Tag,
  Text,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { CheckCircleIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { apiFetch } from "../utils/api";
import { useAppTheme } from "../styles/appTheme";

const toMs = (d) =>
  d?.toDate
    ? d.toDate().getTime()
    : typeof d === "string" || typeof d === "number"
    ? new Date(d).getTime()
    : 0;

const PLAN_TEXT_FIELDS = new Set([
  "title",
  "subtitle",
  "label",
  "clientLabel",
  "proLabel",
  "note",
  "detail",
  "brandingLabel",
  "extraFeature",
  "valueBadge",
  "features",
]);

const planTextKey = (value) =>
  `auto.PlanProfessionnel.planText.${String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72)}`;

const localizePlanNode = (node, t, fieldName = "") => {
  if (typeof node === "string") {
    return PLAN_TEXT_FIELDS.has(fieldName) ? t(planTextKey(node), node) : node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => localizePlanNode(item, t, fieldName));
  }
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, localizePlanNode(value, t, key)])
    );
  }
  return node;
};

export default function PlanProfessionnel() {
  const { t } = useTranslation();
  const toast = useToast();
  const theme = useAppTheme();
  const navigate = useNavigate();
  const { user, loading, hasCoachAccess } = useAuth();
  const [submittingKey, setSubmittingKey] = useState("");

  const isAuthed = !!user?.uid;
  const isCoach = useMemo(() => user?.role === "coach" || user?.role === "admin", [user]);

  const trialActive = useMemo(() => {
    if (!user) return false;
    const end = toMs(user.trialEndsAt);
    return user.subscriptionStatus === "trialing" && end && Date.now() < end;
  }, [user]);

  const trialDaysLeft = useMemo(() => {
    if (!trialActive) return null;
    const end = toMs(user?.trialEndsAt);
    return Math.ceil(Math.max(0, end - Date.now()) / 86400000);
  }, [trialActive, user]);

  const coachOnlyBlocked = isAuthed && !isCoach;
  const canCheckout = isAuthed && isCoach;
  const planScope = useMemo(() => {
    if (!isAuthed || !isCoach) return "all";
    if (user?.accountType === "club_owner" || user?.clubRole === "owner" || user?.packageKey === "club") {
      return "club";
    }
    return "pro";
  }, [isAuthed, isCoach, user]);

  const startRegister = (packageKey = "complete", billing = "monthly", variant = null) => {
    const params = new URLSearchParams({
      role: "coach",
      next: "/plans/professionnel",
      package: packageKey,
      billing,
    });
    if (variant?.key) params.set("packageTier", variant.key);
    if (variant?.trialDays) params.set("trialDays", String(variant.trialDays));
    navigate(`/register?${params.toString()}`);
  };

  const goCheckout = async ({ packageKey, billing, variant }) => {
    if (!isAuthed) {
      startRegister(packageKey, billing, variant);
      return;
    }
    if (coachOnlyBlocked) {
      navigate("/user-dashboard");
      return;
    }

    const submitKey = `${packageKey}:${variant?.key || "default"}:${billing}`;
    setSubmittingKey(submitKey);

    try {
      const modules =
        packageKey === "club"
          ? ["sport", "nutrition", "club"]
          : packageKey === "complete"
          ? ["sport", "nutrition"]
          : [packageKey];

      const data = await apiFetch("/payments/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({
          mode: "subscription",
          customer_email: user.email,
          firebaseUid: user.uid,
          type: "account",
          role: "coach",
          plan: billing,
          packageKey,
          packageTier: variant?.key || "starter",
          clientLimit: variant?.clientLimit ?? null,
          proLimit: variant?.proLimit ?? 1,
          trialDays: variant?.trialDays ?? (packageKey === "club" ? 30 : 14),
          modules,
          frontendBaseUrl: window.location.origin,
          forceNoTrial: true,
          includeTrial: false,
        }),
      });

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || t("errors.invalidStripeResponse", "Réponse Stripe invalide"));
      }
    } catch (err) {
      toast({
        title: t("errors.payment_failed") || "Erreur paiement",
        description: err?.message || String(err),
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      setSubmittingKey("");
    }
  };

  const pageDescColor = theme.mutedText;
  const cardBg = theme.surfaceSoft;
  const cardMutedBg = theme.surfaceBg;
  const borderEmph = theme.borderStrong;
  const borderSoft = theme.borderColor;
  const mutedText = theme.mutedText;
  const priceColor = theme.textColor;

  const Feature = ({ children }) => (
    <HStack align="start" spacing={3}>
      <Icon as={CheckCircleIcon} color="green.400" boxSize={4} mt="2px" />
      <Text fontSize="sm">{children}</Text>
    </HStack>
  );

  const plans = useMemo(() => [
    {
      key: "sport",
      title: "Pro Sport",
      subtitle: "Pour les coachs sportifs qui veulent gérer programmes, séances et progression.",
      badge: { label: "Coach sportif", colorScheme: "blue" },
      variants: [
        {
          key: "solo",
          label: "Solo",
          clientLabel: "10 clients",
          clientLimit: 10,
          proLimit: 1,
          monthly: "39 €",
          yearly: "390 €",
          note: "Pour tester",
          detail: "L'essentiel pour construire des programmes, suivre les séances et tester l'espace client.",
          brandingLabel: "Logo personnalisé bloqué",
          features: [
            "Banque d'exercices complète",
            "Création et assignation de programmes",
            "Session Player et validation des séances",
            "Exports PDF et suivi des clients",
          ],
        },
        {
          key: "growth",
          label: "Croissance",
          clientLabel: "30 clients",
          clientLimit: 30,
          proLimit: 1,
          monthly: "59 €",
          yearly: "590 €",
          note: "Logo sur exports",
          extraFeature: "Logo sur PDF et documents partagés",
          detail: "Pensé pour un cabinet actif avec un plafond clair de clients et les exports personnalisés.",
          brandingLabel: "Logo sur documents inclus",
        },
        {
          key: "unlimited",
          label: "Illimité",
          clientLabel: "Clients illimités",
          clientLimit: null,
          proLimit: 1,
          monthly: "79 €",
          yearly: "790 €",
          note: "Meilleur ratio",
          extraFeature: "Logo, PDF personnalisés, nom affiché dans la navigation et support prioritaire",
          detail: "Pour suivre sans limite de clients et afficher votre identité dans l'espace professionnel.",
          brandingLabel: "Nom pro affiché dans l'app",
          valueBadge: "Meilleur ratio",
        },
      ],
      features: [
        "Banque d’exercices complète",
        "Création et assignation de programmes",
        "Planning avancé, validations de séances et Session Player",
        "Exports PDF et suivi des clients",
      ],
    },
    {
      key: "nutrition",
      title: "Pro Nutrition",
      subtitle: "Pour les diététiciens et pros nutrition qui ne veulent pas l’espace sport.",
      badge: { label: "Diététicien", colorScheme: "green" },
      variants: [
        {
          key: "solo",
          label: "Solo",
          clientLabel: "10 patients",
          clientLimit: 10,
          proLimit: 1,
          monthly: "39 €",
          yearly: "390 €",
          note: "Pour tester",
          detail: "Pour démarrer les bilans, menus et partages patient avec un volume maîtrisé.",
          brandingLabel: "Logo personnalisé bloqué",
        },
        {
          key: "growth",
          label: "Croissance",
          clientLabel: "30 patients",
          clientLimit: 30,
          proLimit: 1,
          monthly: "59 €",
          yearly: "590 €",
          note: "Cabinet actif",
          extraFeature: "Logo sur bilans, menus et documents partagés",
          detail: "Pour suivre davantage de patients avec des documents identifiés à votre cabinet.",
          brandingLabel: "Logo sur documents inclus",
        },
        {
          key: "unlimited",
          label: "Illimité",
          clientLabel: "Patients illimités",
          clientLimit: null,
          proLimit: 1,
          monthly: "79 €",
          yearly: "790 €",
          note: "Meilleur ratio",
          extraFeature: "Logo, documents patients personnalisés et nom affiché dans la navigation",
          detail: "Pour un cabinet nutrition sans limite de patients et une identité visible dans l'espace pro.",
          brandingLabel: "Nom pro affiché dans l'app",
          valueBadge: "Meilleur ratio",
        },
      ],
      features: [
        "Bilans nutrition et dossiers patients",
        "Rations, menus, recettes et listes de courses",
        "Partage contrôlé vers l’espace client",
        "Suivi des objectifs et historiques nutrition",
      ],
    },
    {
      key: "complete",
      title: "Pro Complet",
      subtitle: "Pour les profils hybrides : coaching sportif, nutrition, suivi client complet.",
      badge: { label: "Recommandé", colorScheme: "purple" },
      emphasized: true,
      variants: [
        {
          key: "solo",
          label: "Solo",
          clientLabel: "10 clients/patients",
          clientLimit: 10,
          proLimit: 1,
          monthly: "69 €",
          yearly: "690 €",
          note: "Sport + nutrition",
          detail: "Le socle complet pour gérer sport et nutrition avec un petit portefeuille client.",
          brandingLabel: "Logo personnalisé bloqué",
        },
        {
          key: "growth",
          label: "Croissance",
          clientLabel: "30 clients/patients",
          clientLimit: 30,
          proLimit: 1,
          monthly: "84 €",
          yearly: "840 €",
          note: "Logo sur exports",
          extraFeature: "Logo sur PDF, bilans et documents partagés",
          detail: "Le bon palier si vous suivez jusqu'à 30 personnes avec des documents personnalisés.",
          brandingLabel: "Logo sur documents inclus",
        },
        {
          key: "unlimited",
          label: "Illimité",
          clientLabel: "Clients/patients illimités",
          clientLimit: null,
          proLimit: 1,
          monthly: "99 €",
          yearly: "990 €",
          note: "Offre la plus rentable",
          extraFeature: "Portail client avec logo du pro et nom affiché dans la navigation",
          detail: "L'offre la plus complète pour hybrides sport/nutrition avec suivi illimité.",
          brandingLabel: "Nom pro affiché dans l'app",
          valueBadge: "Le plus rentable",
        },
      ],
      features: [
        "Tout le module Sport",
        "Tout le module Nutrition",
        "Dashboard mixte selon les services du client",
        "Parcours complet pour coachs, nutritionnistes et profils hybrides",
      ],
    },
    {
      key: "club",
      title: "Licence Club",
      subtitle: "Pour studios, salles et structures avec plusieurs intervenants.",
      badge: { label: "Structure", colorScheme: "orange" },
      variants: [
        {
          key: "studio",
          label: "Studio",
          clientLabel: "100 clients",
          proLabel: "3 pros",
          clientLimit: 100,
          proLimit: 3,
          monthly: "149 €",
          yearly: "1 490 €",
          note: "Essai 30 jours",
          trialDays: 30,
          extraFeature: "Logo club sur les espaces et invitations",
          detail: "Pour une petite structure avec quelques intervenants et une vue responsable.",
          brandingLabel: "Logo club inclus",
        },
        {
          key: "club",
          label: "Club",
          clientLabel: "300 clients",
          proLabel: "8 pros",
          clientLimit: 300,
          proLimit: 8,
          monthly: "229 €",
          yearly: "2 290 €",
          note: "Essai 30 jours",
          trialDays: 30,
          extraFeature: "Logo du club sur PDF et documents",
          detail: "Pour une salle active avec plus de clients, plus de pros et des exports club.",
          brandingLabel: "Logo sur documents inclus",
          valueBadge: "Meilleur ratio",
        },
        {
          key: "network",
          label: "Réseau",
          clientLabel: "Clients illimités",
          proLabel: "20 pros",
          clientLimit: null,
          proLimit: 20,
          monthly: "299 €",
          yearly: "2 990 €",
          note: "Essai 30 jours inclus",
          trialDays: 30,
          extraFeature: "Logo, nom affiché, exports et espace club personnalisés",
          detail: "Pour une structure multi-sites ou une équipe large avec capacité client illimitée.",
          brandingLabel: "Nom du club affiché dans l'app",
          valueBadge: "Le plus rentable",
        },
      ],
      features: [
        "Accès complet à la plateforme",
        "Chaque pro possède son propre compte",
        "Vue responsable club sur coachs, clients, programmes et performances",
        "Rapports consolidés pour suivre l’activité globale du club",
      ],
    },
  ], []);

  const availablePlans = useMemo(() => {
    if (planScope === "club") return plans.filter((plan) => plan.key === "club");
    if (planScope === "pro") return plans.filter((plan) => plan.key !== "club");
    return plans;
  }, [planScope, plans]);

  const localizedPlans = useMemo(() => availablePlans.map((plan) => localizePlanNode(plan, t)), [availablePlans, t]);

  const PlanCard = ({ plan }) => {
    const defaultVariantKey = plan.variants[1]?.key || plan.variants[0]?.key || "starter";
    const [selectedVariantKey, setSelectedVariantKey] = useState(defaultVariantKey);
    const selectedVariant =
      plan.variants.find((variant) => variant.key === selectedVariantKey) || plan.variants[0];
    const isClubPlan = plan.key === "club";
    const taxLabel = isClubPlan ? ` ${t("auto.PlanProfessionnel.ht", "HT")}` : "";
    const annualSubmitKey = `${plan.key}:${selectedVariant.key}:yearly`;
    const monthlySubmitKey = `${plan.key}:${selectedVariant.key}:monthly`;
    const features = selectedVariant.features || plan.features;
    const brandingLabel =
      selectedVariant.brandingLabel ||
      t("auto.PlanProfessionnel.planText.logo_personnalise_bloque", "Logo personnalisé bloqué");

    return (
      <Box
        bg={cardBg}
        backgroundImage="radial-gradient(circle at 92% 8%, rgba(59,130,246,0.10), transparent 30%)"
        borderRadius="24px"
        p={6}
        borderWidth="1px"
        borderColor={plan.emphasized ? borderEmph : borderSoft}
        boxShadow={plan.emphasized ? "0 20px 60px rgba(15,23,42,0.10)" : "none"}
        display="flex"
        flexDirection="column"
        minH="100%"
      >
        <VStack align="stretch" spacing={4} flex="1">
          <HStack justify="space-between" align="start" gap={4}>
            <Box>
              <Heading size="md">{plan.title}</Heading>
              <Text mt={2} color={mutedText} fontSize="sm">
                {plan.subtitle}
              </Text>
            </Box>
            <Badge colorScheme={plan.badge.colorScheme}>{plan.badge.label}</Badge>
          </HStack>

          <HStack align="baseline" spacing={2}>
            <Text fontSize="3xl" fontWeight="900" color={priceColor}>
              {selectedVariant.monthly}{taxLabel}
            </Text>
            <Text color={mutedText} fontSize="sm">{t("auto.PlanProfessionnel.mois", "/ mois")}</Text>
          </HStack>
          <Text fontSize="sm" color={mutedText}>{t("auto.PlanProfessionnel.ou", "ou")} {selectedVariant.yearly}{taxLabel} {t("auto.PlanProfessionnel.an", "/ an ·")} {selectedVariant.note}
          </Text>
          {isClubPlan && (
            <Text fontSize="xs" color={mutedText}>
              {t("auto.PlanProfessionnel.club_prices_excluding_tax", "Prix hors taxes · TVA calculée au paiement")}
            </Text>
          )}
          {selectedVariant.detail && (
            <Text fontSize="sm" color={mutedText} lineHeight="1.55">
              {selectedVariant.detail}
            </Text>
          )}

          <Box>
            <Text fontSize="xs" color={mutedText} fontWeight="800" textTransform="uppercase" mb={2}>{t("auto.PlanProfessionnel.capacite", "Capacité")}</Text>
            <HStack spacing={2} flexWrap="wrap">
              {plan.variants.map((variant) => {
                const selected = variant.key === selectedVariant.key;
                return (
                  <Button
                    key={variant.key}
                    size="sm"
                    borderRadius="full"
                    variant={selected ? "solid" : "outline"}
                    colorScheme={selected ? plan.badge.colorScheme : "gray"}
                    onClick={() => setSelectedVariantKey(variant.key)}
                  >
                    {variant.label}
                  </Button>
                );
              })}
            </HStack>
            <HStack spacing={2} flexWrap="wrap" mt={3}>
              <Tag borderRadius="full" colorScheme="gray">
                {selectedVariant.clientLabel}
              </Tag>
              <Tag borderRadius="full" colorScheme={plan.key === "club" ? "orange" : "gray"}>
                {selectedVariant.proLabel || t("auto.PlanProfessionnel.planText.1_pro", "1 pro")}
              </Tag>
              {selectedVariant.valueBadge && (
                <Tag borderRadius="full" colorScheme="green">
                  {selectedVariant.valueBadge}
                </Tag>
              )}
              {plan.key === "club" && (
                <Tag borderRadius="full" colorScheme="blue">{t("auto.PlanProfessionnel.essai_30_jours", "Essai 30 jours")}</Tag>
              )}
            </HStack>
            <HStack spacing={2} flexWrap="wrap" mt={2}>
              <Tag borderRadius="full" colorScheme={selectedVariant.extraFeature ? "green" : "gray"}>
                {brandingLabel}
              </Tag>
            </HStack>
          </Box>

          <VStack align="stretch" spacing={2}>
            {features.map((feature) => (
              <Feature key={feature}>{feature}</Feature>
            ))}
            {selectedVariant.extraFeature && (
              <Feature>{selectedVariant.extraFeature}</Feature>
            )}
          </VStack>

          <Stack direction="column" spacing={3} pt={2} mt="auto">
            <Button
              {...theme.primaryButtonProps}
              w="full"
              variant={plan.emphasized ? "solid" : "outline"}
              isDisabled={coachOnlyBlocked}
              isLoading={submittingKey === monthlySubmitKey}
              onClick={() =>
                goCheckout({ packageKey: plan.key, billing: "monthly", variant: selectedVariant })
              }
            >
              {canCheckout
                ? t("auto.PlanProfessionnel.choisir_mensuel", "Choisir mensuel")
                : t("auto.PlanProfessionnel.demarrer_l_essai", "Démarrer l’essai")}
            </Button>
            <Button
              {...theme.primaryButtonProps}
              w="full"
              variant="solid"
              isDisabled={coachOnlyBlocked}
              isLoading={submittingKey === annualSubmitKey}
              onClick={() =>
                goCheckout({ packageKey: plan.key, billing: "yearly", variant: selectedVariant })
              }
            >
              {canCheckout
                ? t("auto.PlanProfessionnel.choisir_annuel", "Choisir annuel")
                : t("auto.PlanProfessionnel.creer_mon_compte", "Créer mon compte")}
            </Button>
          </Stack>
        </VStack>
      </Box>
    );
  };

  if (loading) {
    return (
      <Container maxW="container.sm" py={16}>
        <Alert status="info" borderRadius="md">
          <AlertIcon />{t("common.loading", "Chargement…")}</Alert>
      </Container>
    );
  }

  return (
    <Box bg={theme.pageBg} minH="100vh" py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }}>
      <Container maxW="container.xl">
        <Box {...theme.cardProps} p={{ base: 5, md: 8 }}>
          <VStack spacing={3} mb={8} textAlign="center">
            <Badge colorScheme="green" borderRadius="full" px={3} py={1}>{t("auto.PlanProfessionnel.essai_14_jours_acces_complet", "Essai 14 jours · accès complet")}</Badge>
            <Heading>{t("auto.PlanProfessionnel.plans_professionnels", "Plans professionnels")}</Heading>
            <Text color={pageDescColor} maxW="780px">{t("auto.PlanProfessionnel.choisissez_le_module_adapte_a_votre_activite_", "Choisissez le module adapté à votre activité, puis ajustez la capacité selon votre volume de suivi.")}</Text>

            <HStack spacing={3} pt={2} justify="center" flexWrap="wrap">
              {!isAuthed ? (
                <Button {...theme.primaryButtonProps} onClick={() => startRegister("complete", "monthly")}>{t("auto.PlanProfessionnel.demarrer_l_essai_complet", "Démarrer l’essai complet")}</Button>
              ) : hasCoachAccess || trialActive ? (
                <Button {...theme.primaryButtonProps} onClick={() => navigate("/coach-dashboard")}>{t("auto.PlanProfessionnel.acceder_a_mon_espace", "Accéder à mon espace")}</Button>
              ) : (
                <Button
                  {...theme.primaryButtonProps}
                  onClick={() => document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" })}
                >{t("auto.PlanProfessionnel.choisir_mon_package", "Choisir mon package")}</Button>
              )}
              {!isAuthed && (
                <Button variant="ghost" as={RouterLink} to="/login">{t("proPlans.cta.alreadyHaveAccount", "J’ai déjà un compte")}</Button>
              )}
            </HStack>

            <HStack spacing={2} pt={1} justify="center" flexWrap="wrap">
              <Tag colorScheme="green" borderRadius="full">{t("auto.PlanProfessionnel.trial_tout_inclus", "Trial tout inclus")}</Tag>
              <Tag colorScheme="blue" borderRadius="full">{t("auto.PlanProfessionnel.modules_activables", "Modules activables")}</Tag>
              {trialActive && (
                <Tag colorScheme="purple" borderRadius="full">{t("auto.PlanProfessionnel.essai_en_cours", "Essai en cours")}{trialDaysLeft ? t("auto.PlanProfessionnel.days_left_short", " · J-{{count}}", { count: trialDaysLeft }) : ""}
                </Tag>
              )}
            </HStack>
          </VStack>

          {coachOnlyBlocked && (
            <Alert status="warning" borderRadius="md" mb={6}>
              <AlertIcon />{t("auto.PlanProfessionnel.cette_page_est_reservee_aux_professionnels_vo", "Cette page est réservée aux professionnels. Votre compte actuel est un espace particulier.")}</Alert>
          )}

          {planScope !== "all" && (
            <Alert status="info" borderRadius="md" mb={6}>
              <AlertIcon />
              {planScope === "club"
                ? t("auto.PlanProfessionnel.votre_essai_club_donne_acces_aux_packs_club", "Votre essai club donne accès uniquement aux packs Club / structure.")
                : t("auto.PlanProfessionnel.votre_essai_pro_donne_acces_aux_packs_pro", "Votre essai pro donne accès uniquement aux packs Pro.")}
            </Alert>
          )}

          <Box
            bg={cardMutedBg}
            borderRadius="24px"
            p={{ base: 5, md: 6 }}
            mb={{ base: 8, md: 10 }}
            borderWidth="1px"
            borderColor={borderSoft}
          >
            <HStack spacing={3} mb={4}>
              <Icon as={InfoOutlineIcon} />
              <Heading size="sm">{t("auto.PlanProfessionnel.nouveaux_parcours_byl_pro", "Nouveaux parcours BYL Pro")}</Heading>
            </HStack>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <VStack align="start" spacing={2}>
                <Feature>{t("auto.PlanProfessionnel.sport_uniquement_dashboard_coach_programmes_e", "Sport uniquement : dashboard coach, programmes, exercices, séances.")}</Feature>
                <Feature>{t("auto.PlanProfessionnel.nutrition_uniquement_bilans_rations_menus_par", "Nutrition uniquement : bilans, rations, menus, partage client.")}</Feature>
              </VStack>
              <VStack align="start" spacing={2}>
                <Feature>{t("auto.PlanProfessionnel.sport_nutrition_interface_mixte_selon_les_ser", "Sport + Nutrition : interface mixte selon les services du client.")}</Feature>
                <Feature>{t("auto.PlanProfessionnel.trial_acces_complet_avant_choix_du_package", "Trial : accès complet avant choix du package.")}</Feature>
              </VStack>
              <VStack align="start" spacing={2}>
                <Feature>{t("auto.PlanProfessionnel.club_multi_comptes_identite_visuelle_et_stati", "Club : multi-comptes, identité visuelle et statistiques consolidées.")}</Feature>
                <Feature>{t("auto.PlanProfessionnel.chaque_formule_evolue_selon_le_volume_de_clie", "Chaque formule évolue selon le volume de clients, patients ou pros.")}</Feature>
              </VStack>
            </SimpleGrid>
          </Box>

          <Box id="plans-section" />
          <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={6}>
            {localizedPlans.map((plan) => (
              <PlanCard key={plan.key} plan={plan} />
            ))}
          </SimpleGrid>

          <VStack spacing={2} mt={10} mb={2}>
            <HStack spacing={2} justify="center" flexWrap="wrap">
              <Tag colorScheme="green" borderRadius="full">{t("proPlans.trust.secure", "Paiement sécurisé")}</Tag>
              <Tag colorScheme="gray" borderRadius="full">{t("proPlans.trust.invoices", "Factures disponibles")}</Tag>
              <Tag colorScheme="gray" borderRadius="full">{t("auto.PlanProfessionnel.package_modifiable_apres_trial", "Package modifiable après trial")}</Tag>
            </HStack>
          </VStack>

          <Divider my={8} />

          <Box textAlign="center">
            {isAuthed && isCoach ? (
              <Button as={RouterLink} to="/coach-dashboard" variant="ghost">{t("auto.PlanProfessionnel.retour_au_tableau_de_bord", "Retour au tableau de bord")}</Button>
            ) : (
              <Button as={RouterLink} to="/" variant="ghost">{t("auto.PlanProfessionnel.retour_a_l_accueil", "Retour à l’accueil")}</Button>
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
