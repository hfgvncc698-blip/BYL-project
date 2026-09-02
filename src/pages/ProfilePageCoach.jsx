// src/pages/ProfilePageCoach.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Button,
  Stack,
  useToast,
  Image,
  Progress,
  HStack,
  Text,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  VStack,
  useColorModeValue,
  SimpleGrid,
  Badge,
  Divider,
  Circle,
  Icon,
  Flex,
} from "@chakra-ui/react";
import { useAuth } from "../AuthContext";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useTranslation } from "react-i18next";
import {
  MdOutlineAlternateEmail,
  MdOutlineBadge,
  MdOutlineImage,
  MdOutlineMailOutline,
  MdOutlinePerson,
  MdOutlinePhone,
  MdOutlineSecurity,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import { notify } from "../utils/notify";
import { canUseCustomBranding } from "../utils/proPlanAccess";
import { apiFetch } from "../utils/api";

import {
  getAuth,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";

const storage = getStorage();

function StatMini({
  label,
  value,
  helper,
  icon,
  accent,
  surfaceBg,
  borderColor,
  mutedText,
  subtleText,
  glassShadow,
}) {
  return (
    <Box
      bg={surfaceBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="22px"
      p={{ base: 4, md: 4.5 }}
      minH={{ base: "auto", xl: "184px" }}
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
      <HStack justify="space-between" align="flex-start" spacing={3} position="relative" zIndex={1}>
        <Box minW={0}>
          <Text fontSize="sm" color={mutedText} fontWeight="600" noOfLines={1}>
            {label}
          </Text>
          <Text
            mt={2}
            fontSize={{ base: "xl", md: "1.85rem" }}
            fontWeight="900"
            letterSpacing="-0.03em"
            lineHeight="1.08"
            noOfLines={2}
          >
            {value}
          </Text>
          {helper ? (
            <Text mt={2.5} fontSize="xs" lineHeight="1.55" color={subtleText} noOfLines={3}>
              {helper}
            </Text>
          ) : null}
        </Box>
        <Circle size="40px" bg={`${accent}20`} color={accent} flexShrink={0}>
          <Icon as={icon} boxSize="20px" />
        </Circle>
      </HStack>
    </Box>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  accent,
  children,
  cardBg,
  borderColor,
  glassShadow,
  subtleText,
}) {
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
            <Heading size="md" letterSpacing="-0.02em">
              {title}
            </Heading>
            {subtitle ? (
              <Text mt={1} fontSize="sm" color={subtleText}>
                {subtitle}
              </Text>
            ) : null}
          </Box>
        </HStack>
      </HStack>
      <Box position="relative" zIndex={1}>
        {children}
      </Box>
    </Box>
  );
}

export default function ProfilePageCoach() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const auth = getAuth();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    logoUrl: "",
  });
  const [initialEmail, setInitialEmail] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isLoading, setLoading] = useState(true);

  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPwd, setReauthPwd] = useState("");
  const [pendingNewEmail, setPendingNewEmail] = useState("");

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
  const darkButtonBg = useColorModeValue("gray.900", "white");
  const darkButtonColor = useColorModeValue("white", "gray.900");
  const secondaryButtonBg = useColorModeValue("white", "rgba(255,255,255,0.06)");
  const secondaryButtonHover = useColorModeValue("gray.50", "rgba(255,255,255,0.12)");
  const isClubMember = user?.accountType === "club_member" && user?.clubRole !== "owner";
  const customBrandingAllowed = !isClubMember && (!user?.proAccess || canUseCustomBranding(user.proAccess));

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        if (snapshot.exists()) {
          const data = snapshot.data();
          const accountEmail = (auth.currentUser?.email || data.email || user.email || "").trim();
          setForm((prev) => ({
            ...prev,
            firstName: data.firstName ?? "",
            lastName: data.lastName ?? "",
            email: accountEmail,
            phone: data.telephone ?? data.phone ?? "",
            logoUrl: data.logoUrl ?? "",
          }));
          setInitialEmail(accountEmail);
          if (
            accountEmail &&
            accountEmail.toLowerCase() !== String(data.email || "").trim().toLowerCase()
          ) {
            updateDoc(doc(db, "users", user.uid), {
              email: accountEmail,
              pendingEmailChange: null,
              updatedAt: serverTimestamp(),
            }).catch(() => null);
          }
        } else {
          setForm((prev) => ({ ...prev, email: user.email ?? "" }));
          setInitialEmail(user.email ?? "");
        }
      } catch (error) {
        toast({
          title: t("profile.toasts.load_error_title"),
          description: error.message,
          status: "error",
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, toast, t]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoSelect = (e) => {
    if (!customBrandingAllowed) {
      notify(toast, "saveError", {
        title: "Logo non inclus",
        description: isClubMember
          ? "Le logo est géré par le responsable du club."
          : "Votre palier actuel ne débloque pas encore le logo personnalisé.",
      });
      e.target.value = "";
      return;
    }
    if (e.target.files?.[0]) setLogoFile(e.target.files[0]);
  };

  const uploadLogoIfAny = () =>
    new Promise((resolve, reject) => {
      if (!logoFile) return resolve(form.logoUrl);
      if (!customBrandingAllowed) return resolve(form.logoUrl);
      const path = `logos/${user.uid}/${logoFile.name}`;
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, logoFile);
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(prog));
        },
        (err) => reject(err),
        () => {
          getDownloadURL(uploadTask.snapshot.ref).then(resolve).catch(reject);
        }
      );
    });

  const updateFirestore = async (payloadOverrides = {}) => {
    const payload = {
      firstName: form.firstName?.trim(),
      lastName: form.lastName?.trim(),
      email: (payloadOverrides.email ?? form.email ?? "").trim(),
      phone: (form.phone ?? "").trim(),
      telephone: (form.phone ?? "").trim(),
      logoUrl: payloadOverrides.logoUrl ?? form.logoUrl ?? "",
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, "users", user.uid), payload);
    setForm((prev) => ({ ...prev, logoUrl: payload.logoUrl }));
  };

  const requestEmailChange = (newEmail) =>
    apiFetch("/client-profile/email-change-verification", {
      method: "POST",
      body: JSON.stringify({
        newEmail,
        lang: String(i18n.resolvedLanguage || i18n.language || "fr").split("-")[0],
      }),
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !auth.currentUser) return;
    setLoading(true);
    try {
      const url = await uploadLogoIfAny();

      const newEmail = (form.email || "").trim();
      const emailChanged =
        newEmail && initialEmail && newEmail.toLowerCase() !== initialEmail.toLowerCase();

      if (emailChanged) {
        const hasPasswordProvider = auth.currentUser.providerData.some((p) => p.providerId === "password");
        if (!hasPasswordProvider) {
          notify(toast, "profileSaved", {
            status: "info",
            title: t("profile.toasts.updated_title"),
            description: t(
              "auth.change_email_with_provider",
              "Votre compte est lié à un fournisseur externe. Changez votre e-mail depuis ce fournisseur ou contactez le support."
            ),
          });
          await updateFirestore({ email: initialEmail, logoUrl: url || "" });
          setForm((current) => ({ ...current, email: initialEmail }));
          setUploadProgress(0);
          setLoading(false);
          return;
        }

        try {
          await requestEmailChange(newEmail);
          await updateFirestore({ email: initialEmail, logoUrl: url || "" });
          setForm((current) => ({ ...current, email: initialEmail }));
          notify(toast, "profileSaved", {
            title: t("profile.toasts.updated_title"),
            description: t(
              "profile.toasts.email_changed",
              "Un e-mail de vérification a été envoyé. L’adresse changera après confirmation du lien."
            ),
          });
        } catch (err) {
          if (
            err?.code === "auth/requires-recent-login" ||
            err?.message === "recent-login-required"
          ) {
            setPendingNewEmail(newEmail);
            setReauthPwd("");
            setReauthOpen(true);
            setUploadProgress(0);
            setLoading(false);
            return;
          }
          let msg = t("profile.toasts.update_error_desc");
          if (
            err?.code === "auth/email-already-in-use" ||
            err?.message === "email-already-in-use"
          ) {
            msg = t("errors.email_in_use", "Cette adresse e-mail est déjà utilisée.");
          } else if (err?.code === "auth/invalid-email") {
            msg = t("errors.invalid_email", "Adresse e-mail invalide.");
          }
          throw new Error(msg);
        }
      } else {
        await updateFirestore({ logoUrl: url || "" });
        notify(toast, "profileSaved", {
          title: t("profile.toasts.updated_title"),
          description: t("profile.toasts.updated_desc"),
        });
      }
    } catch (error) {
      notify(toast, "saveError", {
        title: t("profile.toasts.update_error_title"),
        description: error?.message || t("profile.toasts.update_error_desc"),
      });
    } finally {
        setLoading(false);
        setUploadProgress(0);
    }
  };

  const handleConfirmReauth = async () => {
    const authUser = auth.currentUser;
    if (!authUser || !pendingNewEmail) {
      setReauthOpen(false);
      return;
    }
    setLoading(true);
    try {
      const cred = EmailAuthProvider.credential(initialEmail, reauthPwd);
      await reauthenticateWithCredential(authUser, cred);
      await requestEmailChange(pendingNewEmail);
      await updateFirestore({ email: initialEmail });
      setForm((current) => ({ ...current, email: initialEmail }));
      notify(toast, "profileSaved", {
        title: t("profile.toasts.updated_title"),
        description: t(
          "profile.toasts.email_changed",
          "Un e-mail de vérification a été envoyé. L’adresse changera après confirmation du lien."
        ),
      });
      setReauthOpen(false);
      setPendingNewEmail("");
      setReauthPwd("");
    } catch (err) {
      let msg = t("profile.toasts.update_error_desc");
      if (err?.code === "auth/wrong-password") {
        msg = t("errors.wrong_password", "Mot de passe incorrect.");
      } else if (err?.code === "auth/too-many-requests") {
        msg = t("errors.too_many_requests", "Trop de tentatives, réessayez plus tard.");
      } else if (
        err?.code === "auth/email-already-in-use" ||
        err?.message === "email-already-in-use"
      ) {
        msg = t("errors.email_in_use", "Cette adresse e-mail est déjà utilisée.");
      } else if (err?.code === "auth/invalid-email") {
        msg = t("errors.invalid_email", "Adresse e-mail invalide.");
      }
      notify(toast, "saveError", {
        title: t("profile.toasts.update_error_title"),
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <AppLoading label={t("common.loading", "Chargement...")} minH="55vh" />;
  }

  const currentFileLabel = (() => {
    if (logoFile?.name) return logoFile.name;
    if (!form.logoUrl) return t("profile.file.none");
    try {
      const base = form.logoUrl.split("?")[0];
      return decodeURIComponent(base.split("/").pop() || "");
    } catch {
      return t("profile.file.none");
    }
  })();

  const coachFullName = `${form.firstName || ""} ${form.lastName || ""}`.trim() || t("profile.title");
  const emailChanged = !!(
    form.email?.trim() &&
    initialEmail &&
    form.email.trim().toLowerCase() !== initialEmail.toLowerCase()
  );

  return (
    <Box
      data-tour-page="coach-profile"
      minH="100vh"
      bg={pageBg}
      px={{ base: 4, md: 6 }}
      py={{ base: 5, md: 7 }}
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        insetX="-10%"
        top="-120px"
        h="280px"
        bg={`radial-gradient(circle, ${topGlow} 0%, transparent 68%)`}
        pointerEvents="none"
      />
      <Box
        position="absolute"
        right="-120px"
        bottom="-120px"
        w="340px"
        h="340px"
        bg={`radial-gradient(circle, ${bottomGlow} 0%, transparent 68%)`}
        pointerEvents="none"
      />

      <Box maxW="1180px" mx="auto" position="relative" zIndex={1}>
        <Box
          data-tour="coach-profile-summary"
          bg={surfaceBgStrong}
          border="1px solid"
          borderColor={borderColor}
          borderRadius={{ base: "28px", md: "32px" }}
          px={{ base: 5, md: 7 }}
          py={{ base: 5, md: 6 }}
          boxShadow={glassShadow}
          position="relative"
          overflow="hidden"
          mb={6}
        >
          <Box
            position="absolute"
            inset={0}
            pointerEvents="none"
            bg={`radial-gradient(circle at 18% 20%, ${heroGlow} 0%, transparent 32%), radial-gradient(circle at 82% 78%, ${heroSecondaryGlow} 0%, transparent 28%)`}
          />

          <Flex
            position="relative"
            zIndex={1}
            direction={{ base: "column", xl: "row" }}
            gap={{ base: 6, xl: 10 }}
            align={{ base: "stretch", xl: "center" }}
          >
            <HStack spacing={4} align="center" flex="1" minW={0}>
              <Box
                w={{ base: "64px", md: "78px" }}
                h={{ base: "64px", md: "78px" }}
                borderRadius="24px"
                bg={heroAvatarBg}
                border="1px solid"
                borderColor={borderColor}
                overflow="hidden"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                {form.logoUrl ? (
                  <Image src={form.logoUrl} alt={t("profile.alt.logo")} w="100%" h="100%" objectFit="cover" />
                ) : (
                  <Icon as={MdOutlineBadge} boxSize={8} color={activeBlue} />
                )}
              </Box>

              <Box minW={0}>
                <Badge
                  mb={2}
                  px={3}
                  py={1}
                  borderRadius="full"
                  bg="rgba(59,130,246,0.10)"
                  color={activeBlue}
                  fontWeight="800"
                  letterSpacing="0.04em"
                >
                  {t("profile.title")}
                </Badge>
                <Heading size="2xl" letterSpacing="-0.04em" color={textColor}>
                  {coachFullName}
                </Heading>
                <Text mt={2} fontSize={{ base: "md", md: "lg" }} color={mutedText} maxW="760px">
                  {t(
                    "profile.coach.subtitle",
                    "Mettez à jour vos informations visibles, votre logo et votre adresse de connexion depuis un espace plus clair et plus pro."
                  )}
                </Text>
              </Box>
            </HStack>

            <SimpleGrid
              columns={{ base: 1, md: 3 }}
              spacing={4}
              minW={{ xl: "600px" }}
              maxW={{ base: "100%", xl: "648px" }}
            >
              <StatMini
                label={t("profile.coach.stats.identity", "Identité")}
                value={form.firstName?.trim() && form.lastName?.trim() ? t("profile.coach.stats.complete", "Complète") : t("profile.coach.stats.pending", "À finir")}
                helper={t("profile.coach.stats.identityHelper", "Nom et prénom du coach")}
                icon={MdOutlinePerson}
                accent={activeBlue}
                surfaceBg={surfaceBg}
                borderColor={borderColor}
                mutedText={mutedText}
                subtleText={subtleText}
                glassShadow={glassShadow}
              />
              <StatMini
                label={t("profile.coach.stats.contact", "Contact")}
                value={form.phone?.trim() ? t("profile.coach.stats.ready", "Prêt") : t("profile.coach.stats.add", "À ajouter")}
                helper={t("profile.coach.stats.contactHelper", "Téléphone utilisé pour vos échanges")}
                icon={MdOutlinePhone}
                accent={activeGreen}
                surfaceBg={surfaceBg}
                borderColor={borderColor}
                mutedText={mutedText}
                subtleText={subtleText}
                glassShadow={glassShadow}
              />
              <StatMini
                label={t("profile.coach.stats.login", "Connexion")}
                value={emailChanged ? t("profile.coach.stats.modified", "Modifié") : t("profile.coach.stats.synced", "Synchronisé")}
                helper={t("profile.coach.stats.loginHelper", "Adresse e-mail de connexion")}
                icon={MdOutlineAlternateEmail}
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

        <SimpleGrid data-tour="coach-profile-form" columns={{ base: 1, xl: 2 }} spacing={6}>
          <SectionCard
            title={t("profile.coach.sections.identity", "Informations du coach")}
            subtitle={t("profile.coach.sections.identitySub", "Nom, prénom, e-mail et téléphone utilisés dans votre espace pro.")}
            icon={MdOutlinePerson}
            accent={activeBlue}
            cardBg={cardBg}
            borderColor={borderColor}
            glassShadow={glassShadow}
            subtleText={subtleText}
          >
            <Box as="form" onSubmit={handleSubmit}>
              <Stack spacing={4}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <FormControl isRequired>
                    <FormLabel color={mutedText}>{t("profile.labels.firstName")}</FormLabel>
                    <Input
                      name="firstName"
                      value={form.firstName}
                      onChange={handleChange}
                      placeholder={t("profile.placeholders.firstName")}
                      bg={surfaceBgStrong}
                      borderColor={borderStrong}
                      h="48px"
                    />
                  </FormControl>

                  <FormControl isRequired>
                    <FormLabel color={mutedText}>{t("profile.labels.lastName")}</FormLabel>
                    <Input
                      name="lastName"
                      value={form.lastName}
                      onChange={handleChange}
                      placeholder={t("profile.placeholders.lastName")}
                      bg={surfaceBgStrong}
                      borderColor={borderStrong}
                      h="48px"
                    />
                  </FormControl>
                </SimpleGrid>

                <FormControl isRequired>
                  <FormLabel color={mutedText}>{t("profile.labels.email")}</FormLabel>
                  <Input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder={t("profile.placeholders.email")}
                    bg={surfaceBgStrong}
                    borderColor={borderStrong}
                    h="48px"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color={mutedText}>{t("profile.labels.phone")}</FormLabel>
                  <Input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder={t("profile.placeholders.phone")}
                    bg={surfaceBgStrong}
                    borderColor={borderStrong}
                    h="48px"
                  />
                </FormControl>

                <HStack pt={2} spacing={3} flexWrap="wrap">
                  <Button
                    type="submit"
                    isLoading={isLoading}
                    bg={darkButtonBg}
                    color={darkButtonColor}
                    _hover={{ opacity: 0.92 }}
                    borderRadius="full"
                    px={6}
                  >
                    {t("profile.actions.save")}
                  </Button>
                  <Badge
                    px={3}
                    py={1.5}
                    borderRadius="full"
                    bg={emailChanged ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)"}
                    color={emailChanged ? "#D97706" : activeGreen}
                    fontWeight="800"
                  >
                    {emailChanged
                      ? t("profile.coach.badges.emailPending", "E-mail modifié, validation requise")
                      : t("profile.coach.badges.savedState", "Coordonnées prêtes")}
                  </Badge>
                </HStack>
              </Stack>
            </Box>
          </SectionCard>

          <VStack spacing={6} align="stretch">
            {customBrandingAllowed ? (
              <SectionCard
                title={t("profile.coach.sections.branding", "Logo et identité visuelle")}
                subtitle={t("profile.coach.sections.brandingSub", "Ajoutez votre logo pour rendre votre espace encore plus professionnel.")}
                icon={MdOutlineImage}
                accent={activeGreen}
                cardBg={cardBg}
                borderColor={borderColor}
                glassShadow={glassShadow}
                subtleText={subtleText}
              >
                <Stack spacing={4}>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    display="none"
                    onChange={handleLogoSelect}
                  />

                  <HStack spacing={4} align={{ base: "flex-start", md: "center" }} flexDir={{ base: "column", md: "row" }}>
                    <Box
                      w="96px"
                      h="96px"
                      borderRadius="24px"
                      bg={surfaceBgStrong}
                      border="1px solid"
                      borderColor={borderStrong}
                      overflow="hidden"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      {form.logoUrl ? (
                        <Image
                          src={form.logoUrl}
                          boxSize="100%"
                          objectFit="cover"
                          alt={t("profile.alt.logo")}
                        />
                      ) : (
                        <Icon as={MdOutlineBadge} boxSize={10} color={activeGreen} />
                      )}
                    </Box>

                    <VStack align="stretch" spacing={3} flex="1" w="full">
                      <HStack spacing={3} flexWrap="wrap">
                        <Button
                          onClick={() => fileInputRef.current?.click()}
                          borderRadius="full"
                          bg={secondaryButtonBg}
                          color={textColor}
                          fontWeight="800"
                          border="1px solid"
                          borderColor={borderStrong}
                          _hover={{ bg: secondaryButtonHover }}
                        >
                          {t("profile.actions.chooseFile", "Choisir un fichier")}
                        </Button>
                        <Badge px={3} py={1.5} borderRadius="full" bg="rgba(59,130,246,0.10)" color={activeBlue} fontWeight="800">
                          {logoFile
                            ? t("profile.coach.badges.newLogo", "Nouveau logo sélectionné")
                            : t("profile.coach.badges.currentLogo", "Logo actuel")}
                        </Badge>
                      </HStack>

                      <Tooltip label={currentFileLabel} hasArrow>
                        <Text fontSize="sm" color={mutedText} noOfLines={2}>
                          {currentFileLabel}
                        </Text>
                      </Tooltip>

                      {logoFile ? (
                        <Progress value={uploadProgress} size="sm" borderRadius="full" colorScheme="blue" />
                      ) : null}
                    </VStack>
                  </HStack>
                </Stack>
              </SectionCard>
            ) : (
              <SectionCard
                title={t("auto.ProfilePageCoach.identite_des_documents", "Identité des documents")}
                subtitle={isClubMember ? "L'identité visuelle est gérée par le responsable du club." : "Ce palier utilise automatiquement l'identité BoostYourLife.coach sur les exports et documents partagés."}
                icon={MdOutlineImage}
                accent={activeGreen}
                cardBg={cardBg}
                borderColor={borderColor}
                glassShadow={glassShadow}
                subtleText={subtleText}
              >
                <HStack spacing={4} align={{ base: "flex-start", md: "center" }} flexDir={{ base: "column", md: "row" }}>
                  <Box
                    w="96px"
                    h="96px"
                    borderRadius="24px"
                    bg={surfaceBgStrong}
                    border="1px solid"
                    borderColor={borderStrong}
                    overflow="hidden"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                    p={3}
                  >
                    <Image src="/logo-byl.png" alt="BoostYourLife.coach" w="100%" h="100%" objectFit="contain" />
                  </Box>
                  <VStack align="stretch" spacing={2} flex="1" w="full">
                    <Badge alignSelf="flex-start" px={3} py={1.5} borderRadius="full" bg="rgba(15,23,42,0.08)" color={textColor} fontWeight="800">
                      {isClubMember ? "Logo du club appliqué" : "Logo BYL appliqué"}
                    </Badge>
                    <Text fontSize="sm" color={mutedText}>
                      {isClubMember
                        ? "Vous pouvez gérer votre profil, mais pas modifier le logo ou l’identité du club."
                        : "L'ajout d'un logo personnalisé démarre au palier Croissance."}
                    </Text>
                  </VStack>
                </HStack>
              </SectionCard>
            )}

            <SectionCard
              title={t("profile.coach.sections.security", "Sécurité de connexion")}
              subtitle={t("profile.coach.sections.securitySub", "La modification d’e-mail peut demander une reconfirmation de votre identité.")}
              icon={MdOutlineSecurity}
              accent={activePurple}
              cardBg={cardBg}
              borderColor={borderColor}
              glassShadow={glassShadow}
              subtleText={subtleText}
            >
              <VStack align="stretch" spacing={4}>
                <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                  <Box
                    bg={surfaceBgStrong}
                    borderRadius="18px"
                    border="1px solid"
                    borderColor={borderStrong}
                    p={4}
                  >
                    <HStack spacing={3} align="flex-start">
                      <Circle size="38px" bg="rgba(59,130,246,0.12)" color={activeBlue}>
                        <Icon as={MdOutlineMailOutline} boxSize="18px" />
                      </Circle>
                      <Box>
                        <Text fontWeight="800" color={textColor}>
                          {t("profile.coach.security.emailTitle", "E-mail de connexion")}
                        </Text>
                        <Text mt={1} fontSize="sm" color={mutedText} wordBreak="break-word">
                          {initialEmail || form.email || "—"}
                        </Text>
                      </Box>
                    </HStack>
                  </Box>

                  <Box
                    bg={surfaceBgStrong}
                    borderRadius="18px"
                    border="1px solid"
                    borderColor={borderStrong}
                    p={4}
                  >
                    <HStack spacing={3} align="flex-start">
                      <Circle size="38px" bg="rgba(139,92,246,0.12)" color={activePurple}>
                        <Icon as={MdOutlineAlternateEmail} boxSize="18px" />
                      </Circle>
                      <Box>
                        <Text fontWeight="800" color={textColor}>
                          {t("profile.coach.security.nextEmailTitle", "Nouvelle adresse")}
                        </Text>
                        <Text mt={1} fontSize="sm" color={mutedText} wordBreak="break-word">
                          {form.email || "—"}
                        </Text>
                      </Box>
                    </HStack>
                  </Box>
                </SimpleGrid>

                <Divider borderColor={borderColor} />

                <Text fontSize="sm" color={subtleText}>
                  {t(
                    "profile.coach.security.helper",
                    "Si votre session est jugée trop ancienne, une confirmation par mot de passe vous sera demandée au moment de l’enregistrement."
                  )}
                </Text>
              </VStack>
            </SectionCard>
          </VStack>
        </SimpleGrid>
      </Box>

      <Modal isOpen={reauthOpen} onClose={() => setReauthOpen(false)} isCentered>
        <ModalOverlay bg="blackAlpha.400" backdropFilter="blur(8px)" />
        <ModalContent
          borderRadius="28px"
          bg={surfaceBgStrong}
          border="1px solid"
          borderColor={borderColor}
          boxShadow={glassShadow}
        >
          <ModalHeader>{t("profile.reauth.title", "Confirmer votre identité")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={2}>
            <Stack spacing={4}>
              <Text fontSize="sm" color={mutedText}>
                {t(
                  "profile.reauth.body",
                  "Pour modifier votre adresse e-mail, entrez votre mot de passe actuel."
                )}
              </Text>
              <FormControl>
                <FormLabel color={mutedText}>{t("auth.password", "Mot de passe")}</FormLabel>
                <Input
                  type="password"
                  value={reauthPwd}
                  onChange={(e) => setReauthPwd(e.target.value)}
                  placeholder="••••••••"
                  bg={surfaceBg}
                  borderColor={borderStrong}
                  h="48px"
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter gap={3}>
            <Button
              variant="outline"
              onClick={() => setReauthOpen(false)}
              borderRadius="full"
              borderColor={borderStrong}
            >
              {t("common.cancel", "Annuler")}
            </Button>
            <Button
              onClick={handleConfirmReauth}
              isLoading={isLoading}
              bg={darkButtonBg}
              color={darkButtonColor}
              borderRadius="full"
              _hover={{ opacity: 0.92 }}
            >
              {t("common.confirm", "Confirmer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
