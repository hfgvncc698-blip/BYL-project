// src/components/AutoProgramQuestionnaire.jsx
import React, { useMemo, useState } from "react";
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
  Divider,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { CheckIcon } from "@chakra-ui/icons";
import { useTranslation } from "react-i18next";

// ✅ helper HTTP centralisé (gère base /api + credentials)
import { apiFetch } from "../utils/api";

// ✅ Firestore : on patch le programme après génération
import { db } from "../firebaseConfig";
import { doc, updateDoc } from "firebase/firestore";

/* --- i18n source keys (labels come from translation files) --- */
const LVL_KEYS = ["beginner", "intermediate", "advanced"];

/**
 * On affiche des libellés i18n, MAIS on envoie des valeurs stables.
 * ⚠️ IMPORTANT : "perte_de_poids" n'existe pas côté params Firestore -> moteur doit utiliser "endurance".
 */
const OBJ_OPTIONS = [
  { labelKey: "massGain", value: "prise_de_masse" },
  { labelKey: "weightLoss", value: "perte_de_poids" }, // UI uniquement (libellé/titre)
  { labelKey: "strength", value: "force" },
  { labelKey: "endurance", value: "endurance" },
  { labelKey: "returnToSport", value: "remise_au_sport" },
  { labelKey: "posture", value: "postural" },
];

/** ✅ Mapping UI -> moteur (parametres_objectif) */
function objectifToParamsKey(objectifUI) {
  if (objectifUI === "perte_de_poids") return "endurance";
  return objectifUI;
}

export default function AutoProgramQuestionnaire() {
  const navigate = useNavigate();
  const { user, isAdmin, effectiveRole, hasCoachAccess } = useAuth();
  const toast = useToast();
  const { t } = useTranslation("common");

  // ✅ rôle UI : admin peut “voir comme coach”
  const isCoachUI = effectiveRole === "coach";
  const isClientUI = user?.role === "particulier";

  // ✅ admin TOUJOURS autorisé à générer (quel que soit viewAs)
  // ✅ coach autorisé si accès pro (trial/payant) via hasCoachAccess
  const canGenerateDirect = Boolean(isAdmin || (isCoachUI && hasCoachAccess));

  // Cas spécial : un coach sans accès (trial fini / pas payé) => on l’envoie au plan PRO (pas aux prix client)
  const isProButNoAccess = Boolean(isCoachUI && !isAdmin && !hasCoachAccess);

  // ⚠️ On stocke la valeur UI (visible)
  const [sexe, setSexe] = useState(""); // "male" | "female"
  const [niveau, setNiveau] = useState(""); // "beginner" | "intermediate" | "advanced"
  const [nbSeances, setNbSeances] = useState(""); // number (1..7) ou ""
  const [objectif, setObjectif] = useState(""); // UI key: "perte_de_poids" | "force" | ...

  const [loading, setLoading] = useState(false);

  // ✅ Robust : évite les surprises avec nbSeances
  const isFormValid =
    String(sexe).trim() !== "" &&
    String(niveau).trim() !== "" &&
    Number(nbSeances) > 0 &&
    String(objectif).trim() !== "";

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

  const pageTitle = isCoachUI || isAdmin
    ? t("autoQ.titleCoach", "Création guidée")
    : t("autoQ.titleClient", "Programme sur mesure");

  // =======================
  // ✅ DEBUG (logs Chrome)
  // =======================
  const DEBUG = useMemo(() => {
    if (typeof window !== "undefined" && window.__BYL_DEBUG__ === true) return true;
    return import.meta?.env?.DEV === true;
  }, []);

  const dbg = (...args) => {
    if (!DEBUG) return;
    // eslint-disable-next-line no-console
    console.log(...args);
  };

  const debugApiFetch = async (path, options = {}, meta = {}) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`.slice(0, 18);
    const started = performance.now();

    const bodyPreview =
      typeof options.body === "string"
        ? options.body
        : options.body
        ? JSON.stringify(options.body)
        : null;

    dbg(
      `%c[BYL][apiFetch][${id}] -> ${options.method || "GET"} ${path}`,
      "color:#4ea1ff;font-weight:700",
      { meta, body: bodyPreview ? safeJson(bodyPreview) : null }
    );

    try {
      const data = await apiFetch(path, options);
      const ms = Math.round(performance.now() - started);

      dbg(
        `%c[BYL][apiFetch][${id}] <- OK (${ms}ms) ${path}`,
        "color:#22c55e;font-weight:700",
        { preview: safePreview(data) }
      );

      return data;
    } catch (e) {
      const ms = Math.round(performance.now() - started);
      dbg(
        `%c[BYL][apiFetch][${id}] <- ERROR (${ms}ms) ${path}`,
        "color:#ef4444;font-weight:700",
        {
          message: e?.message,
          name: e?.name,
          stack: e?.stack,
        }
      );
      throw e;
    }
  };

  function safeJson(str) {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }

  function safePreview(data) {
    if (!data) return data;
    if (Array.isArray(data)) return { array: true, length: data.length, first: data[0] };
    if (typeof data === "object") {
      const keys = Object.keys(data);
      return { keys, sample: pick(data, ["ok", "programId", "clientId", "url", "error", "debug"]) };
    }
    return data;
  }

  function pick(obj, keys) {
    const out = {};
    keys.forEach((k) => {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    });
    return out;
  }

  // ✅ dérivés “UI vs moteur”
  const objectifUI = objectif; // visible (ex: perte_de_poids)
  const objectifParamsKey = useMemo(() => objectifToParamsKey(objectifUI), [objectifUI]);

  /**
   * ✅ FIX CRITIQUE :
   * Le backend ne met pas forcément "objectifUI" dans Firestore.
   * Donc après génération, on PATCH le doc programme avec objectifUI + nbSeancesUI + objectifParamsKey.
   * -> si data.clientId existe : clients/{clientId}/programmes/{programId}
   * -> sinon : programmes/{programId}
   */
  const patchProgramDocWithUI = async ({ clientIdFromApi, programId }) => {
    if (!programId) return;

    const payloadToStore = {
      objectifUI: objectifUI || null,
      nbSeancesUI: Number(nbSeances) || null,
      objectifParamsKey: objectifParamsKey || null,

      // facultatif (utile debug)
      niveauSportif: niveau || null,
      sexe: sexe || null,

      uiPrefsUpdatedAt: Date.now(),
    };

    // on enlève les null/undefined/""
    Object.keys(payloadToStore).forEach((k) => {
      if (
        payloadToStore[k] === null ||
        payloadToStore[k] === undefined ||
        payloadToStore[k] === ""
      ) {
        delete payloadToStore[k];
      }
    });

    try {
      const ref = clientIdFromApi
        ? doc(db, "clients", clientIdFromApi, "programmes", programId)
        : doc(db, "programmes", programId);

      dbg("%c[BYL][patchProgramDocWithUI] updateDoc", "color:#a78bfa;font-weight:700", {
        path: clientIdFromApi
          ? `clients/${clientIdFromApi}/programmes/${programId}`
          : `programmes/${programId}`,
        payloadToStore,
      });

      await updateDoc(ref, payloadToStore);
    } catch (e) {
      // best effort: ne bloque pas la navigation
      dbg(
        "%c[BYL][patchProgramDocWithUI] failed (ignored)",
        "color:#f59e0b;font-weight:700",
        e?.message
      );
    }
  };

  // ---------- backend helpers ----------
  const savePendingPrefs = async () => {
    try {
      const payload = {
        userId: user?.uid || null,
        sexe,
        niveau,
        nbSeances: Number(nbSeances),

        // ✅ visible + moteur
        objectifUI,
        objectifParamsKey,

        // ✅ compat legacy => on force aussi objectif moteur
        objectif: objectifParamsKey,
      };

      dbg("%c[BYL][pendingPrefs] payload", "color:#a78bfa;font-weight:700", payload);

      await debugApiFetch(
        "/payments/pending-program",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        { feature: "pending-program" }
      );
    } catch (e) {
      dbg("%c[BYL][pendingPrefs] failed (ignored)", "color:#f59e0b;font-weight:700", e?.message);
    }
  };

  // Redirection Stripe (abonnement particulier OU achat unique)
  const handleStripePayment = async (mode) => {
    // ✅ Si admin/coach autorisé => pas de paywall ici
    if (canGenerateDirect || loading) return;

    if (!user?.uid) {
      toast({
        title: t("autoQ.toasts.authNeeded.title", "Connexion requise"),
        description: t("autoQ.toasts.authNeeded.desc", "Connecte-toi pour poursuivre le paiement."),
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
        description: t("autoQ.toasts.missing.desc", "Remplis les 4 champs pour continuer."),
        status: "info",
        duration: 3000,
        position: "top",
      });
      return;
    }

    setLoading(true);
    try {
      dbg("%c[BYL][stripe] start", "color:#22c55e;font-weight:700", {
        mode,
        uid: user.uid,
        email: user.email,
        origin: window.location.origin,
        options: { niveau, nbSeances: Number(nbSeances), objectifUI, objectifParamsKey, sexe },
      });

      // 1) stocker les prefs (best effort)
      await savePendingPrefs();

      // 2) créer la session Checkout
      const data = await debugApiFetch(
        "/payments/create-checkout-session",
        {
          method: "POST",
          body: JSON.stringify({
            mode, // "subscription" | "payment"
            customer_email: user.email,
            firebaseUid: user.uid,
            frontendBaseUrl: window.location.origin,
            options: {
              niveau,
              nbSeances: Number(nbSeances),

              // ✅ visible + moteur
              objectifUI,
              objectifParamsKey,

              // ✅ compat legacy => on force aussi objectif moteur
              objectif: objectifParamsKey,

              sexe,
            },
          }),
        },
        { feature: "stripe-checkout" }
      );

      if (data?.url) {
        dbg("%c[BYL][stripe] redirect", "color:#22c55e;font-weight:700", data.url);
        window.location.href = data.url;
      } else {
        throw new Error(t("autoQ.errors.checkout", "Impossible d’ouvrir la page de paiement."));
      }
    } catch (e) {
      toast({
        title: t("autoQ.toasts.paymentError.title", "Erreur paiement"),
        description: e.message,
        status: "error",
      });
      setLoading(false);
    }
  };

  const handleGenerateDirect = async () => {
    if (!canGenerateDirect || loading) return;

    if (!isFormValid) {
      toast({
        title: t("autoQ.toasts.missing.title", "Champs manquants"),
        description: t("autoQ.toasts.missing.create", "Remplis les 4 champs pour créer le programme."),
        status: "warning",
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        userId: user?.uid,

        // ✅ le backend attend “coach” pour la génération
        role: "coach",

        sexe,
        niveau,
        nbSeances: Number(nbSeances),

        // ✅ visible + moteur
        objectifUI, // ex: perte_de_poids (visible)
        objectifParamsKey, // ex: endurance (moteur)

        // ✅ CRITIQUE : on force "objectif" = clé moteur pour la génération
        objectif: objectifParamsKey,
      };

      dbg("%c[BYL][generate] payload", "color:#4ea1ff;font-weight:700", payload);

      const data = await debugApiFetch(
        "/programs/generate",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        { feature: "program-generate" }
      );

      dbg("%c[BYL][generate] response", "color:#4ea1ff;font-weight:700", data);

      if (!data?.programId) {
        throw new Error(t("autoQ.errors.missingProgramId", "Réponse inattendue (programId manquant)."));
      }

      // ✅ PATCH Firestore (best effort) : pas besoin de clientId
      await patchProgramDocWithUI({
        clientIdFromApi: data?.clientId || null,
        programId: data.programId,
      });

      // ✅ navigation
      if (data?.clientId) {
        navigate(`/clients/${data.clientId}/programmes/${data.programId}`);
      } else {
        navigate(`/programmes/${data.programId}`);
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
  const PriceCard = ({ highlight = false, title, subtitle, cta, onClick, disabled }) => (
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

      <Text fontSize="lg" fontWeight="extrabold" mb={1}>
        {title}
      </Text>
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

        {/* ✅ BANNERS */}
        {(isAdmin || isCoachUI) && (
          <HStack
            spacing={2}
            mb={4}
            bg={useColorModeValue("green.50", "green.900")}
            border={`1px solid ${useColorModeValue("#38A169", "#2F855A")}`}
            color={useColorModeValue("green.700", "green.100")}
            borderRadius="lg"
            p={3}
            align="center"
            justify="center"
          >
            <Icon as={CheckIcon} />
            <Text fontSize="sm" fontWeight="semibold">
              {isAdmin
                ? t("autoQ.adminBanner", "Admin — accès complet")
                : hasCoachAccess
                ? t("autoQ.coachBanner", "Espace coach — {{status}}", {
                    status: t("autoQ.coachActive", "accès actif"),
                  })
                : t("autoQ.coachBanner", "Espace coach — {{status}}", {
                    status: t("autoQ.coachNeeded", "abonnement requis"),
                  })}
            </Text>
          </HStack>
        )}

        {isProButNoAccess && (
          <Box
            mb={5}
            border="1px solid"
            borderColor={useColorModeValue("yellow.300", "yellow.600")}
            bg={useColorModeValue("yellow.50", "yellow.900")}
            rounded="lg"
            p={4}
          >
            <Text fontWeight="bold" mb={1}>
              {t("autoQ.proPaywall.title", "Accès coach requis")}
            </Text>
            <Text fontSize="sm" color={muted} mb={3}>
              {t(
                "autoQ.proPaywall.desc",
                "Ton essai/abonnement n’est pas actif. Active l’accès pro pour générer automatiquement des programmes."
              )}
            </Text>
            <Button
              w="100%"
              h="44px"
              fontWeight="bold"
              onClick={() => navigate("/plans/professionnel")}
            >
              {t("autoQ.proPaywall.cta", "Voir l’offre Pro")}
            </Button>
          </Box>
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
              onChange={(e) => {
                const v = e.target.value; // UI key
                setObjectif(v);
                const params = objectifToParamsKey(v);
                dbg("%c[BYL][objectif] selected", "color:#22c55e;font-weight:700", {
                  objectifUI: v,
                  objectifParamsKey: params,
                });
              }}
              placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}
            >
              {OBJ_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`autoQ.goals.${opt.labelKey}`)}
                </option>
              ))}
            </Select>
          </FormControl>

          {/* ✅ CTA / PAYWALL */}
          {canGenerateDirect ? (
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
              isDisabled={!isFormValid || loading}
              onClick={handleGenerateDirect}
            >
              {t("autoQ.createProgram", "Créer le programme")}
            </Button>
          ) : isProButNoAccess ? (
            // coach sans accès : on ne montre pas le pricing client
            <>
              <Divider />
              <Text fontSize="sm" color={muted} textAlign="center">
                {t("autoQ.proPaywall.hint", "Active l’offre Pro pour débloquer la génération automatique.")}
              </Text>
            </>
          ) : (
            // client: pricing normal
            <Stack spacing={4}>
              <PriceCard
                highlight
                title={t("autoQ.prices.sub.title", "Abonnement 39,99 €/mois")}
                subtitle={
                  <>
                    <Badge colorScheme="green" mr={2}>
                      {t("autoQ.prices.sub.badge", "1er mois 29,99 €")}
                    </Badge>
                    {t("autoQ.prices.sub.subtitle", "nouveau programme personnalisé chaque mois")}
                  </>
                }
                cta={t("autoQ.prices.sub.cta", "Choisir l’abonnement")}
                disabled={!isFormValid}
                onClick={() => handleStripePayment("subscription")}
              />
              <PriceCard
                title={t("autoQ.prices.one.title", "Achat unique 89,99 €")}
                subtitle={t("autoQ.prices.one.subtitle", "Programme complet, sans renouvellement")}
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
              {!isClientUI && (
                <Text fontSize="xs" color={muted} textAlign="center">
                  {t(
                    "autoQ.noteClientPaywall",
                    "Ces tarifs concernent l’espace client. L’espace coach se débloque via l’offre Pro."
                  )}
                </Text>
              )}
            </Stack>
          )}
        </VStack>
      </Box>
    </Flex>
  );
}
