// src/pages/PlanProfessionnel.jsx
import React, { useMemo, useState } from "react";
import {
  Box,
  Container,
  Heading,
  SimpleGrid,
  VStack,
  Text,
  Button,
  Badge,
  useToast,
  Alert,
  AlertIcon,
  HStack,
  Divider,
  Icon,
  Tag,
  useColorModeValue,
} from "@chakra-ui/react";
import { CheckCircleIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

// ✅ helper HTTP centralisé
import { apiFetch } from "../utils/api";

const toMs = (d) =>
  d?.toDate
    ? d.toDate().getTime()
    : typeof d === "string" || typeof d === "number"
    ? new Date(d).getTime()
    : 0;

export default function PlanProfessionnel() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, loading, hasCoachAccess } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const isAuthed = !!user?.uid;
  const isCoach = useMemo(() => user?.role === "coach", [user]);

  // ✅ Trial actif = subscriptionStatus trialing + trialEndsAt futur
  const trialActive = useMemo(() => {
    if (!user) return false;
    const end = toMs(user.trialEndsAt);
    const now = Date.now();
    return user.subscriptionStatus === "trialing" && end && now < end;
  }, [user]);

  const trialDaysLeft = useMemo(() => {
    if (!trialActive) return null;
    const end = toMs(user?.trialEndsAt);
    const diff = Math.max(0, end - Date.now());
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }, [trialActive, user]);

  const pageDescColor = useColorModeValue("gray.600", "gray.300");
  const cardBg = useColorModeValue("white", "gray.800");
  const cardMutedBg = useColorModeValue("gray.50", "blackAlpha.300");
  const borderEmph = useColorModeValue("blue.300", "blue.400");
  const borderSoft = useColorModeValue("gray.200", "whiteAlpha.200");
  const mutedText = useColorModeValue("gray.600", "gray.300");
  const priceColor = useColorModeValue("gray.900", "white");

  // ✅ Le backend choisit le priceId via .env selon { role, plan }
  const goCheckout = async ({ plan }) => {
    if (!user) {
      navigate("/register");
      return;
    }

    setSubmitting(true);

    try {
      const data = await apiFetch("/payments/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({
          mode: "subscription",
          customer_email: user.email,
          firebaseUid: user.uid,
          type: "account",
          role: "coach",
          plan, // "monthly" | "yearly"
          frontendBaseUrl: window.location.origin,

          // ✅ IMPORTANT : on ne veut pas recréer un trial Stripe ici
          forceNoTrial: true,
          includeTrial: false,
        }),
      });

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || "Stripe response invalide");
      }
    } catch (err) {
      toast({
        title: t("errors.payment_failed") || "Erreur paiement",
        description: err?.message || String(err),
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      setSubmitting(false);
    }
  };

  const handleStripeMonthly = () => goCheckout({ plan: "monthly" });
  const handleStripeAnnual = () => goCheckout({ plan: "yearly" });

  // ✅ CTA principal (en haut) selon état user
  const primaryCTA = useMemo(() => {
    if (!isAuthed) {
      return {
        label: t("proPlans.cta.createAccount", { defaultValue: "Créer un compte" }),
        onClick: () => navigate("/register"),
        variant: "solid",
        colorScheme: "blue",
      };
    }

    if (!isCoach) {
      return {
        label: t("proPlans.cta.goClient", { defaultValue: "Aller à mon espace" }),
        onClick: () => navigate("/user-dashboard"),
        variant: "solid",
        colorScheme: "blue",
      };
    }

    if (hasCoachAccess || trialActive) {
      return {
        label: t("proPlans.cta.goCoach", { defaultValue: "Accéder à mon espace coach" }),
        onClick: () => navigate("/coach-dashboard"),
        variant: "solid",
        colorScheme: "blue",
      };
    }

    return {
      label: t("proPlans.cta.choosePlan", { defaultValue: "Choisir une formule" }),
      onClick: () => {
        const el = document.getElementById("plans-section");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      variant: "solid",
      colorScheme: "blue",
    };
  }, [isAuthed, isCoach, hasCoachAccess, trialActive, navigate, t]);

  const subtitle = useMemo(() => {
    if (!isAuthed) {
      return t("proPlans.subtitleLoggedOut", {
        defaultValue:
          "Créez un compte pour démarrer l’essai gratuit 14 jours et accéder à l’espace coach.",
      });
    }
    if (!isCoach) {
      return t("proPlans.subtitleNotCoach", {
        defaultValue:
          "Cette offre est réservée aux coachs. Vous pouvez continuer sur votre espace particulier.",
      });
    }
    if (trialActive) {
      return t("proPlans.subtitleTrial", {
        defaultValue: `Votre essai est en cours${trialDaysLeft ? ` (J-${trialDaysLeft})` : ""}. Vous avez accès à l’espace coach.`,
      });
    }
    if (hasCoachAccess) {
      return t("proPlans.subtitleActive", {
        defaultValue: "Votre accès est actif. Vous pouvez utiliser l’espace coach.",
      });
    }
    return t("proPlans.subtitlePaywall", {
      defaultValue:
        "Votre essai est terminé. Choisissez une formule pour continuer à utiliser l’espace coach.",
    });
  }, [isAuthed, isCoach, trialActive, trialDaysLeft, hasCoachAccess, t]);

  const Feature = ({ children }) => (
    <HStack align="start" spacing={3}>
      <Icon as={CheckCircleIcon} color="green.400" boxSize={4} mt="2px" />
      <Text fontSize="sm">{children}</Text>
    </HStack>
  );

  const PlanCard = ({
    title,
    price,
    cadence,
    highlights = [],
    cta,
    onClick,
    badge,
    emphasized = false,
    outline = false,
    footnote,
    isDisabled = false,
  }) => (
    <Box
      bg={cardBg}
      borderRadius="xl"
      p={6}
      borderWidth="1px"
      borderColor={emphasized ? borderEmph : borderSoft}
      boxShadow={emphasized ? "xl" : "sm"}
      position="relative"
      role="group"
      opacity={isDisabled ? 0.6 : 1}
    >
      {badge && (
        <Badge
          position="absolute"
          top={4}
          right={4}
          colorScheme={badge.colorScheme || "blue"}
        >
          {badge.label}
        </Badge>
      )}

      <VStack align="stretch" spacing={4}>
        <Heading size="md">{title}</Heading>

        <HStack align="baseline" spacing={1}>
          <Text fontSize="3xl" fontWeight="bold" color={priceColor}>
            {price}
          </Text>
          <Text color={mutedText} fontSize="sm">
            / {cadence}
          </Text>
        </HStack>

        <VStack align="stretch" spacing={2}>
          {highlights.map((h, idx) => (
            <Feature key={idx}>{h}</Feature>
          ))}
        </VStack>

        {footnote && (
          <Text fontSize="xs" color={mutedText} mt={1}>
            {footnote}
          </Text>
        )}

        <Button
          mt={3}
          colorScheme="blue"
          variant={outline ? "outline" : "solid"}
          isFullWidth
          onClick={onClick}
          isLoading={submitting}
          isDisabled={isDisabled}
          _groupHover={{ transform: isDisabled ? "none" : "translateY(-1px)" }}
          transition="transform 0.15s ease"
        >
          {cta}
        </Button>
      </VStack>
    </Box>
  );

  if (loading) {
    return (
      <Container maxW="container.sm" py={16}>
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          {t("proPlans.checking", { defaultValue: "Chargement…" })}
        </Alert>
      </Container>
    );
  }

  // ✅ Blocage uniquement si connecté mais pas coach
  const coachOnlyBlocked = isAuthed && !isCoach;

  // ✅ Libellés CTA demandés (quand non connecté)
  const ctaTrialLoggedOut = "Démarrer l’essai gratuit";
  const ctaMonthlyLoggedOut = "Commencer à 79€/mois";
  const ctaYearlyLoggedOut = "Économiser avec l’annuel";

  return (
    <Container maxW="container.xl" py={{ base: 10, md: 16 }}>
      <VStack spacing={3} mb={8} textAlign="center">
        <Heading>
          {t("proPlans.title", { defaultValue: "Nos formules Professionnels" })}
        </Heading>
        <Text color={pageDescColor}>{subtitle}</Text>

        <HStack spacing={3} pt={2} justify="center" flexWrap="wrap">
          <Button
            colorScheme={primaryCTA.colorScheme}
            variant={primaryCTA.variant}
            onClick={primaryCTA.onClick}
          >
            {primaryCTA.label}
          </Button>

          {!isAuthed && (
            <Button variant="ghost" as={RouterLink} to="/login">
              {t("proPlans.cta.alreadyHaveAccount", {
                defaultValue: "J’ai déjà un compte",
              })}
            </Button>
          )}
        </HStack>

        <HStack spacing={2} pt={1} justify="center" flexWrap="wrap">
          {!isAuthed && (
            <Tag colorScheme="gray" borderRadius="full">
              {t("proPlans.status.needAccount", { defaultValue: "Compte requis" })}
            </Tag>
          )}
          {trialActive && (
            <Tag colorScheme="green" borderRadius="full">
              {trialDaysLeft ? `Essai en cours (J-${trialDaysLeft})` : "Essai en cours"}
            </Tag>
          )}
          {hasCoachAccess && (
            <Tag colorScheme="blue" borderRadius="full">
              {t("proPlans.status.active", { defaultValue: "Accès actif" })}
            </Tag>
          )}
        </HStack>
      </VStack>

      {!isAuthed && (
        <Box mb={6}>
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            {t("proPlans.loggedOutInfo", {
              defaultValue:
                "Pour démarrer l’essai gratuit et accéder à l’espace coach, créez un compte (30 secondes).",
            })}
          </Alert>
        </Box>
      )}

      {coachOnlyBlocked && (
        <Box mb={6}>
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            {t("proPlans.notCoachInfo", {
              defaultValue:
                "Cette offre est destinée aux coachs. Vous pouvez continuer sur votre espace particulier.",
            })}
          </Alert>
        </Box>
      )}

      {/* Section — bénéfices */}
      <Box
        bg={cardMutedBg}
        borderRadius="xl"
        p={{ base: 5, md: 6 }}
        mb={{ base: 8, md: 10 }}
        borderWidth="1px"
        borderColor={borderSoft}
      >
        <HStack spacing={3} mb={3}>
          <Icon as={InfoOutlineIcon} />
          <Heading size="sm">
            {t("proPlans.benefits.title", {
              defaultValue: "Ce que vous obtenez avec BYL Pro",
            })}
          </Heading>
        </HStack>

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <VStack align="start" spacing={2}>
            <Feature>
              {t("proPlans.benefits.b1", {
                defaultValue: "Création illimitée de programmes personnalisés",
              })}
            </Feature>
            <Feature>
              {t("proPlans.benefits.b2", {
                defaultValue: "Banque d’exercices enrichie & exports PDF",
              })}
            </Feature>
          </VStack>

          <VStack align="start" spacing={2}>
            <Feature>
              {t("proPlans.benefits.b3", {
                defaultValue: "Suivi en temps réel des clients",
              })}
            </Feature>
            <Feature>
              {t("proPlans.benefits.b4", {
                defaultValue: "Tableaux de bord & analytics",
              })}
            </Feature>
          </VStack>

          <VStack align="start" spacing={2}>
            <Feature>
              {t("proPlans.benefits.b5", { defaultValue: "Support prioritaire" })}
            </Feature>
            <Feature>
              {t("proPlans.benefits.b6", {
                defaultValue: "Accès sécurisé et multi‐appareils",
              })}
            </Feature>
          </VStack>
        </SimpleGrid>
      </Box>

      {/* Plans */}
      <Box id="plans-section" />
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
        {/* Essai */}
        <Box
          bg={cardBg}
          borderRadius="xl"
          p={6}
          borderWidth="1px"
          borderColor={borderSoft}
        >
          <Badge colorScheme="green" mb={3}>
            {t("proPlans.trial.badge", { defaultValue: "Essai 14 j" })}
          </Badge>

          <Heading size="md" mb={2}>
            {!isAuthed
              ? t("proPlans.trial.title", { defaultValue: "Essai gratuit (14 jours)" })
              : trialActive
              ? t("proPlans.trial.titleRunning", { defaultValue: "Essai gratuit (en cours)" })
              : t("proPlans.trial.titleEnded", { defaultValue: "Essai gratuit (terminé)" })}
          </Heading>

          <Text fontSize="sm" color={mutedText} mb={4}>
            {!isAuthed
              ? t("proPlans.trial.descLoggedOut", {
                  defaultValue:
                    "Créez un compte coach pour activer votre essai et accéder à toutes les fonctionnalités.",
                })
              : trialActive
              ? t("proPlans.trial.descRunning", {
                  defaultValue: `Votre essai est en cours${trialDaysLeft ? ` (J-${trialDaysLeft})` : ""}.`,
                })
              : t("proPlans.trial.descEnded", {
                  defaultValue:
                    "Vous avez déjà bénéficié de l’essai gratuit. Souscrivez à l’une des formules pour continuer.",
                })}
          </Text>

          <VStack align="stretch" spacing={2}>
            <Feature>{t("proPlans.benefits.b1", { defaultValue: "Création illimitée" })}</Feature>
            <Feature>{t("proPlans.benefits.b3", { defaultValue: "Suivi en temps réel" })}</Feature>
            <Feature>{t("proPlans.benefits.b2", { defaultValue: "Exports PDF & analytics" })}</Feature>
            <Feature>{t("proPlans.benefits.b5", { defaultValue: "Support prioritaire" })}</Feature>
          </VStack>

          {!isAuthed ? (
            <Button
              mt={6}
              isFullWidth
              colorScheme="blue"
              onClick={() => navigate("/register")}
            >
              {ctaTrialLoggedOut}
            </Button>
          ) : trialActive || hasCoachAccess ? (
            <Button
              mt={6}
              isFullWidth
              colorScheme="blue"
              onClick={() => navigate("/coach-dashboard")}
            >
              {t("proPlans.trial.ctaGo", { defaultValue: "Accéder à mon espace coach" })}
            </Button>
          ) : (
            <Button mt={6} isFullWidth isDisabled>
              {t("proPlans.trial.ctaUsed", { defaultValue: "Essai déjà utilisé" })}
            </Button>
          )}
        </Box>

        {/* Mensuel */}
        <PlanCard
          title={t("proPlans.monthly.title", { defaultValue: "Abonnement mensuel" })}
          price={t("proPlans.monthly.price", { defaultValue: "79 €" })}
          cadence={t("proPlans.cadence.month", { defaultValue: "mois" })}
          highlights={[
            t("proPlans.monthly.h1", { defaultValue: "Sans engagement : annulez à tout moment" }),
            t("proPlans.monthly.h2", { defaultValue: "Accès complet : création, suivi, analytics" }),
            t("proPlans.monthly.h3", { defaultValue: "Support prioritaire inclus" }),
          ]}
          cta={
            !isAuthed
              ? ctaMonthlyLoggedOut
              : coachOnlyBlocked
              ? t("proPlans.cta.notEligible", { defaultValue: "Réservé aux coachs" })
              : t("proPlans.monthly.cta", { defaultValue: "Souscrire à 79 €/mois" })
          }
          onClick={() => {
            if (!isAuthed) return navigate("/register");
            if (coachOnlyBlocked) return navigate("/user-dashboard");
            return handleStripeMonthly();
          }}
          badge={{
            label: t("proPlans.badges.popular", { defaultValue: "Populaire" }),
            colorScheme: "blue",
          }}
          emphasized
          isDisabled={coachOnlyBlocked}
        />

        {/* Annuel */}
        <PlanCard
          title={t("proPlans.yearly.title", { defaultValue: "Abonnement annuel" })}
          price={t("proPlans.yearly.price", { defaultValue: "790 €" })}
          cadence={t("proPlans.cadence.year", { defaultValue: "an" })}
          highlights={[
            t("proPlans.yearly.h1", { defaultValue: "Meilleur tarif : 2 mois offerts" }),
            t("proPlans.yearly.h2", { defaultValue: "Accès complet : création, suivi, analytics" }),
            t("proPlans.yearly.h3", { defaultValue: "Support prioritaire inclus" }),
          ]}
          cta={
            !isAuthed
              ? ctaYearlyLoggedOut
              : coachOnlyBlocked
              ? t("proPlans.cta.notEligible", { defaultValue: "Réservé aux coachs" })
              : t("proPlans.yearly.cta", { defaultValue: "Souscrire à 790 €/an" })
          }
          onClick={() => {
            if (!isAuthed) return navigate("/register");
            if (coachOnlyBlocked) return navigate("/user-dashboard");
            return handleStripeAnnual();
          }}
          badge={{
            label: t("proPlans.badges.savings", { defaultValue: "Économie" }),
            colorScheme: "purple",
          }}
          outline
          footnote={t("proPlans.yearly.footnote", {
            defaultValue: "Équivalent 65,83 € / mois",
          })}
          isDisabled={coachOnlyBlocked}
        />
      </SimpleGrid>

      <VStack spacing={2} mt={10} mb={2}>
        <HStack spacing={2} justify="center" flexWrap="wrap">
          <Tag colorScheme="green" borderRadius="full">
            {t("proPlans.trust.secure", { defaultValue: "Paiement sécurisé" })}
          </Tag>
          <Tag colorScheme="gray" borderRadius="full">
            {t("proPlans.trust.cancel", { defaultValue: "Annulable depuis votre espace" })}
          </Tag>
          <Tag colorScheme="gray" borderRadius="full">
            {t("proPlans.trust.invoices", { defaultValue: "Factures disponibles" })}
          </Tag>
        </HStack>
      </VStack>

      <Divider my={8} />

      <Box textAlign="center">
        {isAuthed && isCoach ? (
          <Button as={RouterLink} to="/coach-dashboard" variant="ghost">
            {t("proPlans.backToDashboard", { defaultValue: "⟵ Retour au tableau de bord" })}
          </Button>
        ) : (
          <Button as={RouterLink} to="/" variant="ghost">
            {t("proPlans.backHome", { defaultValue: "⟵ Retour à l’accueil" })}
          </Button>
        )}
      </Box>
    </Container>
  );
}
