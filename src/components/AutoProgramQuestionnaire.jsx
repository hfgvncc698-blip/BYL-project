// src/components/AutoProgramQuestionnaire.jsx
import React, { useState } from "react";
import {
  Box,
  Heading,
  VStack,
  Button,
  Select,
  useColorModeValue,
  FormControl,
  FormLabel,
  Flex,
  Text,
  useToast,
  Icon,
  HStack,
  Spinner,
  Badge,
  Stack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { CheckIcon } from "@chakra-ui/icons";
import { useTranslation } from "react-i18next";

// ✅ helper HTTP centralisé (gère base /api + credentials)
import { apiFetch } from "../utils/api";

/* --- i18n source keys (labels come from translation files) --- */
/* IMPORTANT: On manipule des CLÉS (stables) et on affiche des libellés (traduits) */
const LVL_KEYS = ["beginner", "intermediate", "advanced"];
const OBJ_KEYS = [
  "massGain",
  "weightLoss",
  "strength",
  "endurance",
  "returnToSport",
  "posture",
];

export default function AutoProgramQuestionnaire() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useTranslation("common");

  const isCoach = user?.role === "coach";
  const hasCoachSub = !!user?.hasActiveSubscription;
  const coachCanGenerate = isCoach && hasCoachSub;

  // ⚠️ On stocke des CLÉS stables, pas des libellés traduits
  const [sexe, setSexe] = useState(""); // "male" | "female"
  const [niveau, setNiveau] = useState(""); // "beginner" | "intermediate" | "advanced"
  const [nbSeances, setNbSeances] = useState(""); // number (1..7)
  const [objectif, setObjectif] = useState(""); // "massGain" | ...

  const [loading, setLoading] = useState(false);
  const isFormValid = sexe && niveau && nbSeances && objectif;

  // ---------- styles ----------
  const pageBg = useColorModeValue("gray.50", "#101626");
  const cardBg = useColorModeValue("white", "#131d2c");
  const labelColor = useColorModeValue("gray.700", "gray.300");
  const selectBg = useColorModeValue("white", "#232d3b");
  const borderColor = useColorModeValue("gray.200", "#263040");
  const shadow = useColorModeValue("xl", "2xl");

  const primary = useColorModeValue("blue.600", "blue.400");
  const primaryHover = useColorModeValue("blue.700", "blue.500");
  const primaryText = "white";
  const outlineText = useColorModeValue("blue.700", "blue.200");
  const outlineBorder = useColorModeValue("blue.200", "blue.700");
  const muted = useColorModeValue("gray.600", "gray.300");

  const pageTitle = isCoach
    ? t("autoQ.titleCoach", "Création guidée")
    : t("autoQ.titleClient", "Programme sur mesure");

  // ---------- backend helpers ----------
  const savePendingPrefs = async () => {
    try {
      const payload = {
        userId: user?.uid || null,
        // ⚠️ on envoie les CLÉS stables
        sexe, // "male" | "female"
        niveau, // "beginner" | ...
        nbSeances: Number(nbSeances),
        objectif, // "massGain" | ...
      };
      await apiFetch("/payments/pending-program", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch {
      // On n'empêche pas le flux Stripe si cet enregistrement échoue
    }
  };

  // Redirection Stripe (abonnement particulier OU achat unique)
  const handleStripePayment = async (mode) => {
    if (coachCanGenerate || loading) return;

    if (!user?.uid) {
      toast({
        title: t("autoQ.toasts.authNeeded.title", "Connexion requise"),
        description: t(
          "autoQ.toasts.authNeeded.desc",
          "Connecte-toi pour poursuivre le paiement."
        ),
        status: "info",
        duration: 3000,
        position: "top",
      });
      return;
    }

    if (!user?.email) {
      toast({
        title: t("autoQ.toasts.emailNeeded.title", "Adresse e-mail requise"),
        description: t(
          "autoQ.toasts.emailNeeded.desc",
          "Renseigne une adresse e-mail dans ton profil avant de payer."
        ),
        status: "warning",
        duration: 4000,
        position: "top",
      });
      return;
    }

    if (!isFormValid) {
      toast({
        title: t("autoQ.toasts.missing.title", "Champs manquants"),
        description: t(
          "autoQ.toasts.missing.desc",
          "Remplis les 4 champs pour continuer."
        ),
        status: "info",
        duration: 3000,
        position: "top",
      });
      return;
    }

    setLoading(true);
    try {
      // 1) stocker les prefs (best effort)
      await savePendingPrefs();

      // 2) créer la session Checkout (👉 on envoie aussi frontendBaseUrl)
      const data = await apiFetch("/payments/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({
          mode, // "subscription" | "payment"
          customer_email: user.email,
          firebaseUid: user.uid,
          frontendBaseUrl: window.location.origin, // ✅ évite le retour en localhost
          options: {
            // ⚠️ on envoie les CLÉS, pas les libellés
            niveau,
            nbSeances: Number(nbSeances),
            objectif,
            sexe,
          },
        }),
      });

      if (data?.url) {
        window.location.href = data.url; // redirection Stripe Checkout
      } else {
        throw new Error(
          t(
            "autoQ.errors.checkout",
            "Impossible d’ouvrir la page de paiement."
          )
        );
      }
    } catch (e) {
      toast({
        title: t("autoQ.toasts.paymentError.title", "Erreur paiement"),
        description: e.message,
        status: "error",
      });
      setLoading(false); // si pas de redirection, on réactive
    }
  };

  const handleGenerateDirect = async () => {
    if (!coachCanGenerate || loading) return;

    if (!isFormValid) {
      toast({
        title: t("autoQ.toasts.missing.title", "Champs manquants"),
        description: t(
          "autoQ.toasts.missing.create",
          "Remplis les 4 champs pour créer le programme."
        ),
        status: "warning",
      });
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch("/programs/generate", {
        method: "POST",
        body: JSON.stringify({
          userId: user?.uid,
          role: "coach",
          // ⚠️ on envoie les CLÉS
          sexe,
          niveau,
          nbSeances: Number(nbSeances),
          objectif,
        }),
      });

      if (data?.clientId && data?.programId) {
        navigate(`/clients/${data.clientId}/programmes/${data.programId}`);
      } else if (data?.programId) {
        navigate(`/programmes/${data.programId}`);
      } else {
        throw new Error(
          t(
            "autoQ.errors.missingProgramId",
            "Réponse inattendue (programId manquant)."
          )
        );
      }
    } catch (e) {
      toast({
        title: t("autoQ.toasts.createError.title", "Erreur de création"),
        description: e.message,
        status: "error",
      });
      setLoading(false);
    }
  };

  // ---------- composant carte prix ----------
  const PriceCard = ({
    highlight = false,
    title,
    subtitle,
    cta,
    onClick,
    disabled,
  }) => (
    <Box
      role="group"
      border="1px solid"
      borderColor={highlight ? useColorModeValue("#cbdafc", "#2a3a6a") : borderColor}
      bg={cardBg}
      rounded="xl"
      p={4}
      boxShadow={highlight ? "lg" : "md"}
      transition="all .15s"
      _hover={{ boxShadow: "xl", transform: disabled ? "none" : "translateY(-2px)" }}
      position="relative"
    >
      {highlight && (
        <Badge colorScheme="purple" position="absolute" top="10px" right="10px" fontWeight="bold">
          {t("autoQ.bestChoice", "Meilleur choix")}
        </Badge>
      )}

      <Text fontSize="lg" fontWeight="extrabold" mb={1}>{title}</Text>
      {subtitle && (
        <Text fontSize="sm" color={muted} mb={3} lineHeight="1.2">
          {subtitle}
        </Text>
      )}

      <Button
        onClick={onClick}
        isDisabled={disabled || loading}
        isLoading={loading}
        loadingText={t("autoQ.redirecting", "Redirection…")}
        w="100%"
        h="52px"
        fontWeight="extrabold"
        fontSize="md"
        color={highlight ? primaryText : outlineText}
        bg={highlight ? primary : "transparent"}
        border={highlight ? "none" : "2px solid"}
        borderColor={highlight ? "transparent" : outlineBorder}
        _hover={highlight ? { bg: primaryHover } : { bg: useColorModeValue("blue.50", "#212a38") }}
        _disabled={{ cursor: "not-allowed", opacity: 1 }}
      >
        {cta}
      </Button>

      {disabled && (
        <Text mt={2} fontSize="xs" color={muted}>
          {t("autoQ.fillToContinue", "Remplissez les champs ci-dessus pour continuer.")}
        </Text>
      )}
    </Box>
  );

  return (
    <Flex minH="100vh" align="center" justify="center" bg={pageBg}>
      <Box
        bg={cardBg}
        borderRadius="2xl"
        boxShadow={shadow}
        p={{ base: 4, sm: 8 }}
        minW={{ base: "90vw", sm: "420px" }}
        maxW="520px"
        w="100%"
        mx={2}
        my={8}
      >
        <Heading as="h2" size="lg" mb={6} textAlign="center" fontWeight="extrabold">
          {pageTitle}
        </Heading>

        {isCoach && (
          <HStack
            spacing={2}
            mb={4}
            bg={hasCoachSub ? "green.50" : "yellow.50"}
            border={`1px solid ${hasCoachSub ? "#38A169" : "#D69E2E"}`}
            color={hasCoachSub ? "green.700" : "yellow.700"}
            borderRadius="lg"
            p={3}
            align="center"
            justify="center"
          >
            <Icon as={CheckIcon} />
            <Text fontSize="sm" fontWeight="semibold">
              {t("autoQ.coachBanner", "Espace coach — {{status}}", {
                status: hasCoachSub
                  ? t("autoQ.coachActive", "abonnement actif")
                  : t("autoQ.coachNeeded", "abonnement requis"),
              })}
            </Text>
          </HStack>
        )}

        <VStack spacing={5} align="stretch">
          <FormControl isRequired>
            <FormLabel color={labelColor}>{t("autoQ.gender", "Sexe")} :</FormLabel>
            <Select
              bg={selectBg}
              borderColor={borderColor}
              value={sexe}
              onChange={(e) => setSexe(e.target.value)}
              placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}
            >
              <option value="male">{t("autoQ.male", "Homme")}</option>
              <option value="female">{t("autoQ.female", "Femme")}</option>
            </Select>
          </FormControl>

          <FormControl isRequired>
            <FormLabel color={labelColor}>{t("autoQ.level", "Niveau")} :</FormLabel>
            <Select
              bg={selectBg}
              borderColor={borderColor}
              value={niveau}
              onChange={(e) => setNiveau(e.target.value)}
              placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}
            >
              {LVL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`autoQ.levels.${key}`)}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl isRequired>
            <FormLabel color={labelColor}>{t("autoQ.frequency", "Fréquence")} :</FormLabel>
            <Select
              bg={selectBg}
              borderColor={borderColor}
              value={nbSeances}
              onChange={(e) => setNbSeances(Number(e.target.value))}
              placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {t("autoQ.sessionsPerWeek", "{{n}} séance(s) / semaine", { n })}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl isRequired>
            <FormLabel color={labelColor}>{t("autoQ.goal", "Objectif")} :</FormLabel>
            <Select
              bg={selectBg}
              borderColor={borderColor}
              value={objectif}
              onChange={(e) => setObjectif(e.target.value)}
              placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}
            >
              {OBJ_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`autoQ.goals.${k}`)}
                </option>
              ))}
            </Select>
          </FormControl>

          {/* ===== PRICING CARDS ===== */}
          {coachCanGenerate ? (
            <Button
              h="56px"
              fontWeight="extrabold"
              fontSize={{ base: "lg", md: "xl" }}
              bg={primary}
              color={primaryText}
              _hover={{ bg: primaryHover }}
              borderRadius="lg"
              isFullWidth
              isLoading={loading}
              loadingText={t("autoQ.creating", "Création…")}
              isDisabled={!isFormValid || loading} // ✅ Chakra prop
              onClick={handleGenerateDirect}
            >
              {t("autoQ.createProgram", "Créer le programme")}
            </Button>
          ) : (
            <Stack spacing={4}>
              <PriceCard
                highlight
                title={t("autoQ.prices.sub.title", "Abonnement 39,99 €/mois")}
                subtitle={
                  <>
                    <Badge colorScheme="green" mr={2}>
                      {t("autoQ.prices.sub.badge", "1er mois 29,99 €")}
                    </Badge>
                    {t(
                      "autoQ.prices.sub.subtitle",
                      "nouveau programme personnalisé chaque mois"
                    )}
                  </>
                }
                cta={t("autoQ.prices.sub.cta", "Choisir l’abonnement")}
                disabled={!isFormValid}
                onClick={() => handleStripePayment("subscription")}
              />
              <PriceCard
                title={t("autoQ.prices.one.title", "Achat unique 89,99 €")}
                subtitle={t(
                  "autoQ.prices.one.subtitle",
                  "Programme complet, sans renouvellement"
                )}
                cta={t("autoQ.prices.one.cta", "Acheter une fois")}
                disabled={!isFormValid}
                onClick={() => handleStripePayment("payment")}
              />
              {loading && (
                <HStack justify="center" opacity={0.8}>
                  <Spinner size="sm" />
                  <Text fontSize="sm">{t("autoQ.connectingStripe", "Connexion à Stripe…")}</Text>
                </HStack>
              )}
            </Stack>
          )}
        </VStack>
      </Box>
    </Flex>
  );
}

