// src/pages/ProfilePageClient.jsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Button,
  Stack,
  useToast,
  Spinner,
  Select,
  HStack,
  Text,
  VStack,
  useColorModeValue,
  SimpleGrid,
  Badge,
  Divider,
  Circle,
  Icon,
  Textarea,
  Flex,
} from "@chakra-ui/react";
import { useAuth } from "../AuthContext";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTranslation } from "react-i18next";

// 🔐 Firebase Auth (email + reset)
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
// ☁️ Cloud Functions (changeClientEmail)
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  MdOutlineFitnessCenter,
  MdOutlineLanguage,
  MdOutlinePerson,
  MdOutlinePhone,
  MdOutlineStraighten,
  MdOutlineTrackChanges,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import PageBackButton from "../components/ui/PageBackButton";
import { notify } from "../utils/notify";

/* ---- conversions identiques à ClientCreation.jsx ---- */
const KG_PER_LB = 0.45359237;
const IN_PER_FT = 12;
const CM_PER_IN = 2.54;
const toNumber = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/* ---------- Langues (codes ISO + libellés UI) ---------- */
const LANGS = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
];
const codeFromAny = (val) => {
  if (!val) return "fr";
  const hit =
    LANGS.find((l) => l.code === val) ||
    LANGS.find((l) => l.label?.toLowerCase() === String(val).toLowerCase());
  return hit?.code || "fr";
};
const labelFromCode = (code) =>
  LANGS.find((l) => l.code === code)?.label || "Français";

function StatMini({ label, value, helper, icon, accent, surfaceBg, borderColor, mutedText, subtleText, glassShadow }) {
  return (
    <Box
      bg={surfaceBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="22px"
      p={4}
      position="relative"
      overflow="hidden"
      boxShadow={glassShadow}
      _before={{
        content: '""',
        position: "absolute",
        right: "-18px",
        bottom: "-22px",
        w: "110px",
        h: "110px",
        borderRadius: "full",
        bg: `${accent}16`,
        filter: "blur(24px)",
      }}
    >
      <HStack justify="space-between" align="flex-start" position="relative" zIndex={1}>
        <Box minW={0}>
          <Text fontSize="sm" color={mutedText} fontWeight="600">
            {label}
          </Text>
          <Text mt={2} fontSize={{ base: "xl", md: "2xl" }} fontWeight="900" letterSpacing="-0.03em">
            {value}
          </Text>
          {helper ? (
            <Text mt={2} fontSize="sm" color={subtleText}>
              {helper}
            </Text>
          ) : null}
        </Box>
        <Circle size="42px" bg={`${accent}20`} color={accent} flexShrink={0}>
          <Icon as={icon} boxSize="20px" />
        </Circle>
      </HStack>
    </Box>
  );
}

function SectionCard({ title, subtitle, icon, accent, children, cardBg, borderColor, glassShadow, subtleText }) {
  return (
    <Box
      bg={cardBg}
      borderRadius="22px"
      p={{ base: 4, md: 5 }}
      boxShadow={glassShadow}
      border="1px solid"
      borderColor={borderColor}
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: "absolute",
        right: "-20px",
        bottom: "-24px",
        w: "140px",
        h: "140px",
        borderRadius: "full",
        bg: `${accent}14`,
        filter: "blur(30px)",
      }}
    >
      <HStack justify="space-between" align="flex-start" mb={4} position="relative" zIndex={1}>
        <HStack spacing={3} align="flex-start">
          <Circle size="40px" bg={`${accent}20`} color={accent} flexShrink={0}>
            <Icon as={icon} boxSize="20px" />
          </Circle>
          <Box>
            <Heading size="md" letterSpacing="-0.02em">{title}</Heading>
            {subtitle ? (
              <Text mt={1} fontSize="sm" color={subtleText}>
                {subtitle}
              </Text>
            ) : null}
          </Box>
        </HStack>
      </HStack>
      <Box position="relative" zIndex={1}>{children}</Box>
    </Box>
  );
}

export default function ProfilePageClient() {
  const { t, i18n } = useTranslation("common");
  const { user } = useAuth();
  const auth = getAuth();
  const toast = useToast();
  const functions = getFunctions(undefined, "europe-west1");
  const changeClientEmailFn = httpsCallable(functions, "changeClientEmail");

  const [isLoading, setLoading] = useState(true);

  // unités & taille/poids
  const [heightUnit, setHeightUnit] = useState("cm"); // "cm" | "ft"
  const [weightUnit, setWeightUnit] = useState("kg"); // "kg" | "lbs"
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");

  // 🔤 langue (on stocke le code) + le reste du formulaire
  const [langCode, setLangCode] = useState("fr");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateNaissance: "",
    sexe: "",
    poids: "",
    niveauSportif: "Débutant",
    objectifs: "Perte de poids",
    notes: "",
  });

  const [initialEmail, setInitialEmail] = useState("");
  const pageBg = useColorModeValue("#F5F7FB", "#070B14");
  const surfaceBg = useColorModeValue("rgba(255,255,255,0.85)", "rgba(15,21,35,0.86)");
  const surfaceBgStrong = useColorModeValue("rgba(255,255,255,0.95)", "rgba(11,16,27,0.95)");
  const cardBg = surfaceBg;
  const borderColor = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.08)");
  const borderStrong = useColorModeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.12)");
  const mutedText = useColorModeValue("rgba(17,24,39,0.68)", "rgba(255,255,255,0.68)");
  const subtleText = useColorModeValue("rgba(17,24,39,0.52)", "rgba(255,255,255,0.46)");
  const textColor = useColorModeValue("#111827", "white");
  const glassShadow = useColorModeValue(
    "0 20px 50px rgba(15,23,42,0.08)",
    "0 20px 60px rgba(0,0,0,0.35)"
  );
  const topGlow = useColorModeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.14)");
  const bottomGlow = useColorModeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.10)");
  const heroGlow = useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.10)");
  const heroSecondaryGlow = useColorModeValue("rgba(16,185,129,0.08)", "rgba(16,185,129,0.10)");
  const heroAvatarBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.05)");
  const activeBlue = "#3B82F6";
  const activeGreen = "#10B981";
  const activePurple = "#8B5CF6";

  /* ---------- applyLanguage: change toute l'appli immédiatement ---------- */
  const applyLanguage = (code) => {
    const next = codeFromAny(code);
    i18n.changeLanguage(next);
    localStorage.setItem("i18nextLng", next);
    // RTL pour arabe
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
      document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    }
  };

  /* ---------- Chargement initial users/{uid} + clients/{uid} ---------- */
  useEffect(() => {
    if (!user?.uid) return;
    const load = async () => {
      try {
        const usersRef = doc(db, "users", user.uid);
        const clientsRef = doc(db, "clients", user.uid);
        const [userSnap, clientSnap] = await Promise.all([
          getDoc(usersRef),
          getDoc(clientsRef),
        ]);

        if (userSnap.exists()) {
          const u = userSnap.data();
          setForm((prev) => ({
            ...prev,
            firstName: u.firstName || "",
            lastName: u.lastName || "",
            email: u.email || "",
            phone: u.telephone || u.phone || "",
          }));
          setInitialEmail(u.email || "");
        }

        if (clientSnap.exists()) {
          const c = clientSnap.data();

          // unités (défaut cm/kg)
          const units = c?.settings?.units || { height: "cm", weight: "kg" };
          setHeightUnit(units.height === "ft" ? "ft" : "cm");
          setWeightUnit(units.weight === "lbs" ? "lbs" : "kg");

          // taille
          const cm = c.heightCm ?? (c.taille ?? null);
          if (cm != null) {
            if (units.height === "cm") setHeightCm(String(cm));
            else {
              const totalIn = cm / CM_PER_IN;
              const ft = Math.floor(totalIn / IN_PER_FT);
              const inch = Math.round(totalIn - ft * IN_PER_FT);
              setHeightFt(String(ft));
              setHeightIn(String(inch));
            }
          }

          // poids (affiché selon unité)
          const kg = c.weightKg ?? (c.poids != null ? toNumber(c.poids) : null);
          let poidsAffiche = "";
          if (kg != null) {
            poidsAffiche =
              units.weight === "kg"
                ? String(kg)
                : String(Math.round(kg / KG_PER_LB));
          }

          // langue (accepte code, label, ou settings.langCode)
          const loadedCode =
            c?.settings?.langCode ||
            codeFromAny(c?.langue) ||
            codeFromAny(i18n.language);
          setLangCode(loadedCode);
          applyLanguage(loadedCode);

          setForm((prev) => ({
            ...prev,
            dateNaissance: c.dateNaissance || "",
            sexe: c.sexe || "",
            poids: poidsAffiche,
            niveauSportif: c.niveauSportif || prev.niveauSportif,
            objectifs: c.objectifs || prev.objectifs,
            notes: c.notes || "",
            email: prev.email || c.email || "",
            phone: prev.phone || c.telephone || "",
            firstName: prev.firstName || c.prenom || "",
            lastName: prev.lastName || c.nom || "",
          }));
        } else {
          const next = codeFromAny(i18n.language);
          setLangCode(next);
          applyLanguage(next);
        }
      } catch (error) {
        console.error("[PROFILE] load error", error);
        toast({
          title: t("profile.toasts.load_error_title"),
          description: error?.message || t("profile.toasts.load_error_desc"),
          status: "error",
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ---------- Handlers champs ---------- */
  const onField = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const onHeightUnitChange = (next) => {
    if (next === heightUnit) return;
    if (next === "ft") {
      const cm = toNumber(heightCm);
      if (cm != null) {
        const totalIn = cm / CM_PER_IN;
        const ft = Math.floor(totalIn / IN_PER_FT);
        const inch = Math.round(totalIn - ft * IN_PER_FT);
        setHeightFt(String(ft));
        setHeightIn(String(inch));
      }
    } else {
      const ft = toNumber(heightFt) ?? 0;
      const inch = toNumber(heightIn) ?? 0;
      const cm = Math.round((ft * IN_PER_FT + inch) * CM_PER_IN);
      setHeightCm(cm ? String(cm) : "");
    }
    setHeightUnit(next);
  };

  const onWeightUnitChange = (next) => {
    if (next === weightUnit) return;
    const cur = toNumber(form.poids);
    if (cur != null) {
      const converted =
        next === "kg"
          ? (cur * KG_PER_LB).toFixed(1) // lbs -> kg
          : (cur / KG_PER_LB).toFixed(0); // kg -> lbs
      setForm((c) => ({ ...c, poids: converted }));
    }
    setWeightUnit(next);
  };

  const onLanguageChange = (e) => {
    const next = codeFromAny(e.target.value);
    setLangCode(next);
    applyLanguage(next);
  };

  /* ---------- Payload client (conversions) ---------- */
  const buildComputedClientPayload = (emailOverride) => {
    // height -> cm
    let heightCmOut = null;
    if (heightUnit === "cm") {
      const v = toNumber(heightCm);
      heightCmOut = v == null ? null : Math.round(v);
    } else {
      const ft = toNumber(heightFt) ?? 0;
      const inch = toNumber(heightIn) ?? 0;
      const totalIn = ft * IN_PER_FT + inch;
      heightCmOut = Math.round(totalIn * CM_PER_IN);
    }
    // weight -> kg
    const w = toNumber(form.poids);
    const weightKgOut =
      w == null
        ? null
        : weightUnit === "lbs"
        ? +(w * KG_PER_LB).toFixed(1)
        : +(+w).toFixed(1);

    const emailToUse = (emailOverride ?? form.email ?? "").trim();
    const langLabel = labelFromCode(langCode);

    return {
      prenom: form.firstName?.trim() || "",
      nom: form.lastName?.trim() || "",
      email: emailToUse,
      telephone: (form.phone || "").trim(),
      dateNaissance: form.dateNaissance || "",
      sexe: form.sexe || "",
      niveauSportif: form.niveauSportif || "",
      objectifs: form.objectifs || "",
      langue: langLabel, // compat historique
      notes: form.notes || "",
      heightCm: heightCmOut,
      weightKg: weightKgOut,
      settings: {
        units: { height: heightUnit, weight: weightUnit },
        defaultLanguage: langLabel,
        langCode,
      },
      updatedAt: serverTimestamp(),
    };
  };

  /* ---------- Mise à jour Firestore (users + clients) ---------- */
  const updateFirestoreDocs = async (emailOverride) => {
    const emailToUse = (emailOverride ?? form.email ?? "").trim();
    const usersRef = doc(db, "users", user.uid);
    const clientsRef = doc(db, "clients", user.uid);
    const langLabel = labelFromCode(langCode);

    await updateDoc(usersRef, {
      firstName: form.firstName?.trim(),
      lastName: form.lastName?.trim(),
      email: emailToUse,
      telephone: (form.phone || "").trim(),
      defaultLanguage: langLabel,
      updatedAt: serverTimestamp(),
    });

    const clientPayload = buildComputedClientPayload(emailToUse);
    await updateDoc(clientsRef, clientPayload);
  };

  /* ---------- Submit ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.uid || !auth.currentUser) return;
    setLoading(true);

    try {
      const newEmail = (form.email || "").trim();
      const emailChanged =
        newEmail &&
        initialEmail &&
        newEmail.toLowerCase() !== initialEmail.toLowerCase();

      if (emailChanged) {
        console.log("[PROF] email change via callable", {
          initialEmail,
          newEmail,
        });

        // 1) Appel Cloud Function -> met à jour l'utilisateur dans Firebase Auth
        const result = await changeClientEmailFn({ newEmail });
        console.log("[PROF] changeClientEmail result:", result.data);

        // 2) Envoi de l'email via Firebase Auth (pas Resend)
        const actionCodeSettings = {
          // en dev
          url: `http://localhost:5173/login?from=email-change&lang=${langCode}`,
          handleCodeInApp: false,
        };

        await sendPasswordResetEmail(auth, newEmail, actionCodeSettings);

        // 3) Mise à jour Firestore (users + clients)
        await updateFirestoreDocs(newEmail);
        setInitialEmail(newEmail);

        notify(toast, "profileSaved", {
          title: t("profile.toasts.updated_title", "Profil mis à jour"),
          description: t(
            "profile.toasts.email_changed",
            "Un email de confirmation a été envoyé à votre nouvelle adresse. Le changement sera effectif après validation du lien."
          ),
        });
      } else {
        await updateFirestoreDocs();
        notify(toast, "profileSaved", {
          title: t("profile.toasts.updated_title", "Profil mis à jour"),
          description: t(
            "profile.toasts.updated_desc",
            "Vos informations ont bien été enregistrées."
          ),
        });
      }
    } catch (error) {
      console.error("[PROFILE] handleSubmit error", error);
      let msg =
        error?.message ||
        t("profile.toasts.update_error_desc", "Veuillez réessayer.");

      // On essaie d'interpréter les erreurs Firebase Auth les plus courantes
      if (error?.code === "auth/email-already-in-use") {
        msg = t("errors.email_in_use", "Cette adresse e-mail est déjà utilisée.");
      } else if (error?.code === "auth/invalid-email") {
        msg = t("errors.invalid_email", "Adresse e-mail invalide.");
      }

      notify(toast, "saveError", {
        title: t("profile.toasts.update_error_title", "Échec de la mise à jour"),
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  /* ---------- UI ---------- */
  if (isLoading) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  const weightPlaceholder =
    weightUnit === "kg"
      ? `${t("clientCreation.weight")} (kg)`
      : `${t("clientCreation.weight")} (lbs)`;
  const heightPlaceholderCm = `${t("clientCreation.height")} (cm)`;
  const profileCompletion = [
    form.firstName,
    form.lastName,
    form.email,
    form.phone,
    form.dateNaissance,
    form.sexe,
    form.poids,
    form.niveauSportif,
    form.objectifs,
  ].filter((v) => String(v || "").trim()).length;
  const profileCompletionPct = Math.round((profileCompletion / 9) * 100);
  const displayedHeight =
    heightUnit === "cm"
      ? (heightCm ? `${heightCm} cm` : "—")
      : (heightFt || heightIn ? `${heightFt || 0} ft ${heightIn || 0} in` : "—");
  const displayedWeight = form.poids ? `${form.poids} ${weightUnit}` : "—";

  return (
    <Box p={{ base: 4, md: 6 }} bg={pageBg} minH="100vh" position="relative" overflow="hidden">
      <Box position="absolute" top={{ base: 4, md: 6 }} left={{ base: 4, md: 6 }} zIndex={20}>
        <PageBackButton />
      </Box>
      <Box
        position="absolute"
        top="-140px"
        right="-100px"
        w="420px"
        h="420px"
        borderRadius="full"
        bg={topGlow}
        filter="blur(90px)"
        pointerEvents="none"
      />
      <Box
        position="absolute"
        bottom="-140px"
        left="-100px"
        w="380px"
        h="380px"
        borderRadius="full"
        bg={bottomGlow}
        filter="blur(90px)"
        pointerEvents="none"
      />
      <VStack maxW="1120px" mx="auto" spacing={6} align="stretch" position="relative" zIndex={1}>
        <Box
          bg={surfaceBgStrong}
          borderRadius="30px"
          p={{ base: 4, md: 5 }}
          boxShadow={glassShadow}
          border="1px solid"
          borderColor={borderStrong}
          position="relative"
          overflow="hidden"
        >
          <Box
            position="absolute"
            top="-40px"
            right="-20px"
            w="220px"
            h="220px"
            borderRadius="full"
            bg={heroGlow}
            filter="blur(38px)"
          />
          <Box
            position="absolute"
            bottom="-60px"
            left="20%"
            w="240px"
            h="240px"
            borderRadius="full"
            bg={heroSecondaryGlow}
            filter="blur(48px)"
          />
          <Flex
            position="relative"
            zIndex={1}
            direction={{ base: "column", xl: "row" }}
            justify="space-between"
            align={{ base: "stretch", xl: "center" }}
            gap={3}
          >
            <HStack spacing={3} align="center" minW={0} flex="1">
              <Circle
                size={{ base: "56px", md: "64px" }}
                bg={heroAvatarBg}
                border="1px solid"
                borderColor={borderStrong}
                color={textColor}
                fontWeight="900"
                fontSize="xl"
                flexShrink={0}
              >
                {(form.firstName || user?.firstName || "U").slice(0, 1).toUpperCase()}
              </Circle>
              <Box minW={0}>
                <Heading as="h1" size={{ base: "md", md: "lg" }} lineHeight="1.05" letterSpacing="-0.03em" color={textColor}>
                  {t("profile.title", "Mon profil")}
                </Heading>
                <Text mt={2} color={mutedText}>
                  Centralisez vos informations, vos objectifs et vos préférences de suivi dans un espace plus clair.
                </Text>
              </Box>
            </HStack>

            <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3} minW={{ base: "100%", xl: "480px" }}>
              <StatMini
                label="Profil complété"
                value={`${profileCompletionPct}%`}
                helper="Informations remplies"
                icon={MdOutlinePerson}
                accent={activeBlue}
                surfaceBg={surfaceBg}
                borderColor={borderColor}
                mutedText={mutedText}
                subtleText={subtleText}
                glassShadow={glassShadow}
              />
              <StatMini
                label="Objectif"
                value={form.objectifs || "—"}
                helper={form.niveauSportif || "Niveau non défini"}
                icon={MdOutlineTrackChanges}
                accent={activeGreen}
                surfaceBg={surfaceBg}
                borderColor={borderColor}
                mutedText={mutedText}
                subtleText={subtleText}
                glassShadow={glassShadow}
              />
              <StatMini
                label="Préférences"
                value={langCode.toUpperCase()}
                helper={`${heightUnit}/${weightUnit}`}
                icon={MdOutlineLanguage}
                accent={activePurple}
                surfaceBg={surfaceBg}
                borderColor={borderColor}
                mutedText={mutedText}
                subtleText={subtleText}
                glassShadow={glassShadow}
              />
            </SimpleGrid>
          </Flex>
        </Box>

        <SimpleGrid columns={{ base: 1, xl: 12 }} spacing={6}>
          <Box gridColumn={{ base: "span 1", xl: "span 4" }}>
            <VStack spacing={6} align="stretch">
              <SectionCard
                title="Vue rapide"
                subtitle="Les repères personnels les plus utiles au quotidien."
                icon={MdOutlinePerson}
                accent={activeBlue}
                cardBg={cardBg}
                borderColor={borderColor}
                glassShadow={glassShadow}
                subtleText={subtleText}
              >
                <VStack align="stretch" spacing={3}>
                  <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p={3.5}>
                    <Text fontSize="xs" color={subtleText} mb={1}>Identité</Text>
                    <Text fontWeight="800">{`${form.firstName || "—"} ${form.lastName || ""}`.trim() || "—"}</Text>
                    <Text mt={1} fontSize="sm" color={mutedText}>{form.email || "—"}</Text>
                  </Box>
                  <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p={3.5}>
                    <Text fontSize="xs" color={subtleText} mb={1}>Mesure actuelle</Text>
                    <Text fontWeight="800">{displayedWeight}</Text>
                    <Text mt={1} fontSize="sm" color={mutedText}>Taille : {displayedHeight}</Text>
                  </Box>
                  <Box border="1px solid" borderColor={borderColor} borderRadius="18px" p={3.5}>
                    <Text fontSize="xs" color={subtleText} mb={1}>Contact</Text>
                    <Text fontWeight="800">{form.phone || "Numéro non renseigné"}</Text>
                    <Text mt={1} fontSize="sm" color={mutedText}>
                      {form.dateNaissance || "Date de naissance non renseignée"}
                    </Text>
                  </Box>
                </VStack>
              </SectionCard>

              <SectionCard
                title="Préférences"
                subtitle="Unités, langue et contexte d'entraînement."
                icon={MdOutlineLanguage}
                accent={activePurple}
                cardBg={cardBg}
                borderColor={borderColor}
                glassShadow={glassShadow}
                subtleText={subtleText}
              >
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <Text color={mutedText}>Langue</Text>
                    <Badge variant="subtle">{labelFromCode(langCode)}</Badge>
                  </HStack>
                  <Divider borderColor={borderColor} />
                  <HStack justify="space-between">
                    <Text color={mutedText}>Unités</Text>
                    <Badge variant="subtle">{heightUnit} / {weightUnit}</Badge>
                  </HStack>
                  <Divider borderColor={borderColor} />
                  <HStack justify="space-between">
                    <Text color={mutedText}>Niveau</Text>
                    <Badge variant="subtle">{form.niveauSportif || "—"}</Badge>
                  </HStack>
                  <Divider borderColor={borderColor} />
                  <HStack justify="space-between">
                    <Text color={mutedText}>Sexe</Text>
                    <Badge variant="subtle">{form.sexe || "—"}</Badge>
                  </HStack>
                </VStack>
              </SectionCard>
            </VStack>
          </Box>

          <Box gridColumn={{ base: "span 1", xl: "span 8" }}>
            <Box
              as="form"
              onSubmit={handleSubmit}
              bg={cardBg}
              borderRadius="22px"
              p={{ base: 4, md: 5 }}
              boxShadow={glassShadow}
              border="1px solid"
              borderColor={borderColor}
            >
              <VStack align="stretch" spacing={6}>
                <SectionCard
                  title="Informations personnelles"
                  subtitle="Votre identité et vos coordonnées de contact."
                  icon={MdOutlinePerson}
                  accent={activeBlue}
                  cardBg={cardBg}
                  borderColor={borderColor}
                  glassShadow={glassShadow}
                  subtleText={subtleText}
                >
                  <Stack spacing={4}>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl isRequired>
              <FormLabel>{t("profile.labels.firstName")}</FormLabel>
              <Input
                name="firstName"
                value={form.firstName}
                onChange={onField}
                placeholder={t("profile.placeholders.firstName")}
                autoComplete="given-name"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>{t("profile.labels.lastName")}</FormLabel>
              <Input
                name="lastName"
                value={form.lastName}
                onChange={onField}
                placeholder={t("profile.placeholders.lastName")}
                autoComplete="family-name"
              />
            </FormControl>
                    </SimpleGrid>

          <FormControl isRequired>
            <FormLabel>{t("profile.labels.email")}</FormLabel>
            <Input
              type="email"
              name="email"
              value={form.email}
              onChange={onField}
              placeholder={t("profile.placeholders.email")}
              autoComplete="email"
            />
          </FormControl>

          <FormControl>
            <FormLabel>{t("profile.labels.phone")}</FormLabel>
            <Input
              name="phone"
              value={form.phone}
              onChange={onField}
              placeholder={t("profile.placeholders.phone")}
              autoComplete="tel"
            />
          </FormControl>
                  </Stack>
                </SectionCard>

                <SectionCard
                  title="Données physiques"
                  subtitle="Les informations utiles pour adapter le suivi à votre profil."
                  icon={MdOutlineStraighten}
                  accent={activeGreen}
                  cardBg={cardBg}
                  borderColor={borderColor}
                  glassShadow={glassShadow}
                  subtleText={subtleText}
                >
                  <Stack spacing={4}>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>{t("clientCreation.birthDate")}</FormLabel>
              <Input
                type="date"
                name="dateNaissance"
                value={form.dateNaissance}
                onChange={onField}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t("clientCreation.gender")}</FormLabel>
              <Select name="sexe" value={form.sexe} onChange={onField}>
                <option value="">{t("common.select", "Sélectionner")}</option>
                <option value="Homme">
                  {t("clientCreation.genderMale")}
                </option>
                <option value="Femme">
                  {t("clientCreation.genderFemale")}
                </option>
              </Select>
            </FormControl>
                    </SimpleGrid>

          {/* Taille */}
          <FormControl>
            <FormLabel>{t("clientCreation.height")}</FormLabel>
            {heightUnit === "cm" ? (
              <HStack>
                <Input
                  placeholder={heightPlaceholderCm}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                />
                <Select
                  w="28"
                  value={heightUnit}
                  onChange={(e) => onHeightUnitChange(e.target.value)}
                >
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </Select>
              </HStack>
            ) : (
              <HStack>
                <Input
                  placeholder="ft"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                />
                <Input
                  placeholder="in"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                />
                <Select
                  w="28"
                  value={heightUnit}
                  onChange={(e) => onHeightUnitChange(e.target.value)}
                >
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </Select>
              </HStack>
            )}
          </FormControl>

          <FormControl>
            <FormLabel>{t("clientCreation.weight")}</FormLabel>
            <HStack>
              <Input
                name="poids"
                placeholder={weightPlaceholder}
                type="number"
                inputMode="decimal"
                step={weightUnit === "kg" ? "0.1" : "1"}
                value={form.poids}
                onChange={onField}
              />
              <Select
                w="28"
                value={weightUnit}
                onChange={(e) => onWeightUnitChange(e.target.value)}
              >
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </Select>
            </HStack>
          </FormControl>
                  </Stack>
                </SectionCard>

                <SectionCard
                  title="Objectifs et préférences"
                  subtitle="Le cadre général de votre progression et de vos habitudes."
                  icon={MdOutlineFitnessCenter}
                  accent={activePurple}
                  cardBg={cardBg}
                  borderColor={borderColor}
                  glassShadow={glassShadow}
                  subtleText={subtleText}
                >
                  <Stack spacing={4}>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      <FormControl>
                        <FormLabel>{t("clientCreation.level")}</FormLabel>
                        <Select
                          name="niveauSportif"
                          value={form.niveauSportif}
                          onChange={onField}
                          required
                        >
                          <option value="Débutant">
                            {t("clientCreation.levels.beginner")}
                          </option>
                          <option value="Intermédiaire">
                            {t("clientCreation.levels.intermediate")}
                          </option>
                          <option value="Confirmé">
                            {t("clientCreation.levels.advanced")}
                          </option>
                        </Select>
                      </FormControl>

                      <FormControl>
                        <FormLabel>{t("clientCreation.objective")}</FormLabel>
                        <Select
                          name="objectifs"
                          value={form.objectifs}
                          onChange={onField}
                          required
                        >
                          <option value="Prise de masse">
                            {t("clientCreation.objectives.gain")}
                          </option>
                          <option value="Perte de poids">
                            {t("clientCreation.objectives.loss")}
                          </option>
                          <option value="Force">
                            {t("clientCreation.objectives.strength")}
                          </option>
                          <option value="Endurance">
                            {t("clientCreation.objectives.endurance")}
                          </option>
                          <option value="Remise au sport">
                            {t("clientCreation.objectives.restart")}
                          </option>
                          <option value="Postural">
                            {t("clientCreation.objectives.posture")}
                          </option>
                        </Select>
                      </FormControl>
                    </SimpleGrid>

                    <FormControl maxW={{ base: "100%", md: "280px" }}>
                      <FormLabel>{t("clientCreation.language")}</FormLabel>
                      <Select value={langCode} onChange={onLanguageChange}>
                        {LANGS.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel>{t("clientCreation.notes")}</FormLabel>
                      <Textarea
                        name="notes"
                        value={form.notes}
                        onChange={onField}
                        placeholder={t("clientCreation.notes")}
                        minH="120px"
                        resize="vertical"
                      />
                    </FormControl>
                  </Stack>
                </SectionCard>

                <HStack justify="space-between" align={{ base: "stretch", md: "center" }} flexDirection={{ base: "column", md: "row" }} spacing={4}>
                  <VStack align={{ base: "stretch", md: "flex-start" }} spacing={1}>
                    <Text fontWeight="700" color={textColor}>Mise à jour du profil</Text>
                    <Text fontSize="sm" color={mutedText}>
                      Les modifications sont enregistrées sur votre compte et votre fiche client.
                    </Text>
                  </VStack>
                  <Button type="submit" isLoading={isLoading} alignSelf={{ base: "stretch", md: "center" }}>
                    {t("profile.actions.save")}
                  </Button>
                </HStack>
              </VStack>
            </Box>
          </Box>
        </SimpleGrid>
      </VStack>
    </Box>
  );
}
