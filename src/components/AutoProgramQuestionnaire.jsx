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
  Progress,
} from "@chakra-ui/react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { CheckIcon } from "@chakra-ui/icons";
import { useTranslation } from "react-i18next";

// ✅ helper HTTP centralisé (gère base /api + credentials)
import { apiFetch } from "../utils/api";

// ✅ Firestore : on patch le programme après génération
import { db } from "../firebaseConfig";
import { doc, updateDoc } from "firebase/firestore";
import { useAppTheme } from "../styles/appTheme";
import PageBackButton from "./ui/PageBackButton";

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

const STEP_COUNT = 3;
const SESSION_DURATION_OPTIONS = [30, 45, 60, 75];
const LOCATION_OPTIONS = [
  { value: "gym", labelKey: "gym" },
  { value: "home", labelKey: "home" },
  { value: "outdoor", labelKey: "outdoor" },
  { value: "mixed", labelKey: "mixed" },
];
const EQUIPMENT_OPTIONS = [
  { value: "full", labelKey: "full" },
  { value: "basic", labelKey: "basic" },
  { value: "bodyweight", labelKey: "bodyweight" },
];
const INJURY_AREA_OPTIONS = [
  { value: "none", labelKey: "none" },
  { value: "back", labelKey: "back" },
  { value: "neck", labelKey: "neck" },
  { value: "shoulder", labelKey: "shoulder" },
  { value: "elbow", labelKey: "elbow" },
  { value: "wrist", labelKey: "wrist" },
  { value: "hip", labelKey: "hip" },
  { value: "knee", labelKey: "knee" },
  { value: "ankle", labelKey: "ankle" },
  { value: "foot", labelKey: "foot" },
];
const INJURY_TYPE_OPTIONS = [
  { value: "pain", labelKey: "pain" },
  { value: "tendinopathy", labelKey: "tendinopathy" },
  { value: "inflammation", labelKey: "inflammation" },
  { value: "strain", labelKey: "strain" },
  { value: "tear", labelKey: "tear" },
];

/** ✅ Mapping UI -> moteur (parametres_objectif) */
function objectifToParamsKey(objectifUI) {
  if (objectifUI === "perte_de_poids") return "endurance";
  return objectifUI;
}

export default function AutoProgramQuestionnaire() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, effectiveRole, hasCoachAccess } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const adminCoachId = searchParams.get("adminCoachId") || "";
  const isAdminCoachMode = isAdmin && !!adminCoachId;
  const withAdminCoach = (path) => {
    if (!isAdminCoachMode) return path;
    return `${path}${path.includes("?") ? "&" : "?"}adminCoachId=${encodeURIComponent(adminCoachId)}`;
  };
  const toast = useToast();
  const { t } = useTranslation("common");
  const theme = useAppTheme();

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
  const [step, setStep] = useState(1);
  const [sessionDurationMin, setSessionDurationMin] = useState(60);
  const [trainingLocation, setTrainingLocation] = useState("gym");
  const [equipmentAccess, setEquipmentAccess] = useState("full");
  const [injuryArea, setInjuryArea] = useState("none");
  const [injuryType, setInjuryType] = useState("pain");

  const [loading, setLoading] = useState(false);

  // ✅ Robust : évite les surprises avec nbSeances
  const isFormValid =
    String(sexe).trim() !== "" &&
    String(niveau).trim() !== "" &&
    Number(nbSeances) > 0 &&
    String(objectif).trim() !== "" &&
    Number(sessionDurationMin) > 0 &&
    String(trainingLocation).trim() !== "" &&
    String(equipmentAccess).trim() !== "";

  const isCurrentStepValid =
    step === 1
      ? String(sexe).trim() !== "" && String(niveau).trim() !== "" && String(objectif).trim() !== ""
      : step === 2
        ? Number(nbSeances) > 0 &&
          Number(sessionDurationMin) > 0 &&
          String(trainingLocation).trim() !== "" &&
          String(equipmentAccess).trim() !== ""
        : true;
  const injuryProfile = injuryArea && injuryArea !== "none"
    ? { area: injuryArea, type: injuryType || "pain" }
    : "none";

  // ---------- styles ----------
  const pageBg = theme.pageBg;
  const cardBg = theme.surfaceBg;
  const labelColor = theme.mutedText;
  const selectBg = theme.surfaceSoft;
  const borderColor = theme.borderColor;
  const shadow = useColorModeValue("0 22px 70px rgba(15,23,42,0.08)", "0 22px 70px rgba(0,0,0,0.28)");

  const primary = theme.primary;
  const primaryHover = theme.primaryHover;
  const primaryText = "white";
  const outlineText = theme.textColor;
  const outlineBorder = theme.borderStrong;
  const muted = theme.mutedText;
  const highlightedBorder = useColorModeValue("#cbdafc", "#2a3a6a");
  const outlineHoverBg = useColorModeValue("blue.50", "#212a38");
  const coachBannerBg = useColorModeValue("green.50", "green.900");
  const coachBannerBorder = useColorModeValue("#38A169", "#2F855A");
  const coachBannerText = useColorModeValue("green.700", "green.100");
  const paywallBorder = useColorModeValue("yellow.300", "yellow.600");
  const paywallBg = useColorModeValue("yellow.50", "yellow.900");

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
      sessionDurationMin: Number(sessionDurationMin) || null,
      trainingLocation: trainingLocation || null,
      equipmentAccess: equipmentAccess || null,
      injuryProfile: injuryProfile || "none",

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
          sessionDurationMin: Number(sessionDurationMin) || null,
          trainingLocation: trainingLocation || null,
          equipmentAccess: equipmentAccess || null,
          injuryProfile: injuryProfile || "none",
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
	        trainingContext: {
            sessionDurationMin: Number(sessionDurationMin) || null,
            trainingLocation,
            equipmentAccess,
            injuryProfile,
          },
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
                sessionDurationMin: Number(sessionDurationMin) || null,
                trainingLocation,
                equipmentAccess,
                injuryProfile,
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
      const objectifLabel =
        t(`autoQ.goals.${OBJ_OPTIONS.find((opt) => opt.value === objectifUI)?.labelKey || ""}`) ||
        objectifUI.replace(/_/g, " ");
      const nomProgramme = `${objectifLabel} — ${Number(nbSeances)}x/Sem`;
      const payload = {
        userId: isAdminCoachMode ? adminCoachId : user?.uid,
        firebaseUid: isAdminCoachMode ? adminCoachId : user?.uid,

        // ✅ le backend attend “coach” pour la génération
        role: "coach",

        sexe,
        niveau,
        nbSeances: Number(nbSeances),

        // ✅ visible + moteur
        objectifUI, // ex: perte_de_poids (visible)
        objectifParamsKey, // ex: endurance (moteur)
        objectifOriginal: objectifUI,
        nomProgramme,

        // ✅ CRITIQUE : on force "objectif" = clé moteur pour la génération
	        objectif: objectifParamsKey,
          sessionDurationMin: Number(sessionDurationMin) || null,
          trainingLocation,
          equipmentAccess,
          injuryProfile,
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
        navigate(withAdminCoach(`/clients/${data.clientId}/programmes/${data.programId}`), {
          state: { fromCreation: true, from: "program-creation" },
        });
      } else {
        navigate(withAdminCoach(`/programmes/${data.programId}`), {
          state: { fromCreation: true, from: "program-creation" },
        });
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
      borderColor={highlight ? highlightedBorder : borderColor}
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
        _hover={highlight ? { bg: primaryHover } : { bg: outlineHoverBg }}
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
        <HStack mb={6} spacing={3} align="center">
          <PageBackButton fallbackTo={withAdminCoach("/coach-dashboard")} />
          <Heading as="h2" size="lg" textAlign="center" fontWeight="extrabold" flex="1">
            {pageTitle}
          </Heading>
          <Box boxSize="32px" />
        </HStack>

        {/* ✅ BANNERS */}
        {(isAdmin || isCoachUI) && (
          <HStack
            spacing={2}
            mb={4}
            bg={coachBannerBg}
            border={`1px solid ${coachBannerBorder}`}
            color={coachBannerText}
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
            borderColor={paywallBorder}
            bg={paywallBg}
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
            <Box>
              <HStack justify="space-between" mb={2}>
                <Text fontSize="sm" fontWeight="bold" color={labelColor}>{t("auto.AutoProgramQuestionnaire.etape", "Étape")}{step}/{STEP_COUNT}
                </Text>
                <Text fontSize="sm" color={muted}>
                  {Math.round((step / STEP_COUNT) * 100)}%
                </Text>
              </HStack>
              <Progress value={(step / STEP_COUNT) * 100} borderRadius="full" size="sm" />
            </Box>

            {step === 1 && (
              <VStack spacing={5} align="stretch">
                <FormControl isRequired>
                  <FormLabel color={labelColor}>{t("autoQ.gender", "Sexe")} :</FormLabel>
                  <Select bg={selectBg} borderColor={borderColor} value={sexe} onChange={(e) => setSexe(e.target.value)} placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}>
                    <option value="male">{t("autoQ.male", "Homme")}</option>
                    <option value="female">{t("autoQ.female", "Femme")}</option>
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel color={labelColor}>{t("autoQ.level", "Niveau")} :</FormLabel>
                  <Select bg={selectBg} borderColor={borderColor} value={niveau} onChange={(e) => setNiveau(e.target.value)} placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}>
                    {LVL_KEYS.map((key) => (
                      <option key={key} value={key}>{t(`autoQ.levels.${key}`)}</option>
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
                      const v = e.target.value;
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
                      <option key={opt.value} value={opt.value}>{t(`autoQ.goals.${opt.labelKey}`)}</option>
                    ))}
                  </Select>
                </FormControl>
              </VStack>
            )}

            {step === 2 && (
              <VStack spacing={5} align="stretch">
                <FormControl isRequired>
                  <FormLabel color={labelColor}>{t("autoQ.frequency", "Fréquence")} :</FormLabel>
                  <Select bg={selectBg} borderColor={borderColor} value={nbSeances} onChange={(e) => setNbSeances(Number(e.target.value))} placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>{t("autoQ.sessionsPerWeek", "{{n}} séance(s) / semaine", { n })}</option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel color={labelColor}>{t("autoQ.sessionDuration", "Temps disponible par séance")}</FormLabel>
                  <Select bg={selectBg} borderColor={borderColor} value={sessionDurationMin} onChange={(e) => setSessionDurationMin(Number(e.target.value))} placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}>
                    {SESSION_DURATION_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>{minutes}{t("auto.AutoProgramQuestionnaire.minutes", "minutes")}</option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel color={labelColor}>{t("autoQ.trainingLocation", "Lieu principal")}</FormLabel>
                  <Select
                    bg={selectBg}
                    borderColor={borderColor}
                    value={trainingLocation}
                    onChange={(e) => {
                      const nextLocation = e.target.value;
                      setTrainingLocation(nextLocation);
                      if (nextLocation === "gym") setEquipmentAccess("full");
                      if (nextLocation === "home" && equipmentAccess === "full") setEquipmentAccess("basic");
                      if (nextLocation === "outdoor") setEquipmentAccess("bodyweight");
                    }}
                    placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}
                  >
                    {LOCATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(`autoQ.locations.${option.labelKey}`)}
                      </option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel color={labelColor}>{t("autoQ.equipmentAccess", "Matériel disponible")}</FormLabel>
                  <Select bg={selectBg} borderColor={borderColor} value={equipmentAccess} onChange={(e) => setEquipmentAccess(e.target.value)} placeholder={t("autoQ.selectPlaceholder", "Veuillez sélectionner")}>
                    {EQUIPMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(`autoQ.equipment.${option.labelKey}`)}
                      </option>
                    ))}
                  </Select>
                  {equipmentAccess === "basic" && (
                    <Text mt={2} fontSize="xs" color={muted}>
                      {t("autoQ.basicEquipmentHint", "Petit matériel : haltères, kettlebell, élastiques, tapis, banc simple ou matériel léger facilement disponible.")}
                    </Text>
                  )}
                </FormControl>
              </VStack>
            )}

            {step === 3 && (
              <VStack spacing={5} align="stretch">
                <FormControl>
                  <FormLabel color={labelColor}>{t("autoQ.injuryArea", "Zone douloureuse / blessure")}</FormLabel>
                  <Select bg={selectBg} borderColor={borderColor} value={injuryArea} onChange={(e) => setInjuryArea(e.target.value)}>
                    {INJURY_AREA_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(`autoQ.injuryAreas.${option.labelKey}`)}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                {injuryArea !== "none" && (
                  <FormControl>
                    <FormLabel color={labelColor}>{t("autoQ.injuryType", "Type de gêne")}</FormLabel>
                    <Select bg={selectBg} borderColor={borderColor} value={injuryType} onChange={(e) => setInjuryType(e.target.value)}>
                      {INJURY_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(`autoQ.injuryTypes.${option.labelKey}`)}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <Text fontSize="sm" color={muted}>
                  {t("autoQ.injuryHint", "Les exercices sensibles seront évités automatiquement selon la zone indiquée.")}
                </Text>
              </VStack>
            )}

            <HStack justify="space-between">
              <Button variant="ghost" onClick={() => setStep((prev) => Math.max(1, prev - 1))} isDisabled={step === 1 || loading}>
                {t("common.back", "Retour")}
              </Button>
              {step < STEP_COUNT ? (
                <Button
                  bg={primary}
                  color={primaryText}
                  _hover={{ bg: primaryHover }}
                  borderRadius="lg"
                  onClick={() => setStep((prev) => Math.min(STEP_COUNT, prev + 1))}
                  isDisabled={!isCurrentStepValid}
                >
                  {t("common.next", "Suivant")}
                </Button>
              ) : canGenerateDirect ? (
                <Button
                  h="52px"
                  fontWeight="extrabold"
                  bg={primary}
                  color={primaryText}
                  _hover={{ bg: primaryHover }}
                  borderRadius="lg"
                  isLoading={loading}
                  loadingText={t("autoQ.creating", "Création…")}
                  isDisabled={!isFormValid || loading}
                  onClick={handleGenerateDirect}
                >
                  {t("autoQ.createProgram", "Créer le programme")}
                </Button>
              ) : null}
            </HStack>

	          {!canGenerateDirect && step === STEP_COUNT && (isProButNoAccess ? (
	            <>
	              <Divider />
	              <Text fontSize="sm" color={muted} textAlign="center">
	                {t("autoQ.proPaywall.hint", "Active l’offre Pro pour débloquer la génération automatique.")}
	              </Text>
	            </>
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
	          ))}
	        </VStack>
      </Box>
    </Flex>
  );
}
