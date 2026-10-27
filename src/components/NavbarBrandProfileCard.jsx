import PlanInclusionBadge from "./PlanInclusionBadge";
import React, { useEffect, useRef, useState } from "react";
import { Box, Heading, HStack, Circle, Icon, Text, Flex, FormControl, FormLabel, Input, Button, useToast, useColorModeValue } from "@chakra-ui/react";
import { MdOutlineBadge } from "react-icons/md";
import { useTranslation } from "react-i18next";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import useSessionDraft from "../hooks/useSessionDraft";
import { canUseNavbarBranding } from "../utils/proPlanAccess";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";
import { AppSurface } from "./ui/AppPrimitives";
const withTimeout = (promise, ms = 25000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      globalThis.setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);

export default function NavbarBrandProfileCard() {
  const { user } = useAuth();
  const { t } = useTranslation("common");
  const toast = useToast();
  const theme = useAppTheme();
  const { textColor, mutedText, subtleText } = theme;
  const subCardBg = theme.surfaceSoft;
  const primaryButtonBg = useColorModeValue("#0F172A", "rgba(255,255,255,0.10)");
  const primaryButtonColor = useColorModeValue("white", "#F8FAFC");
  const primaryButtonHoverBg = useColorModeValue("#1E293B", "rgba(255,255,255,0.16)");
  const surfaceCardProps = { bg: theme.surfaceBgStrong, borderRadius: "22px", border: "1px solid", borderColor: theme.borderStrong };
  const isClubMember = user?.accountType === "club_member" && user?.clubRole !== "owner";
  const [savingNavbarBrand, setSavingNavbarBrand] = useState(false);
  const [navbarBrandName, setNavbarBrandName] = useState(
    user?.settings?.navbarBrandName || ""
  );
  const [brandDraft, setBrandDraft] = useSessionDraft(user?.uid ? `navbar-brand:${user.uid}` : null, null);
  const navbarBrandDirtyRef = useRef(brandDraft !== null);
  const navbarBrandInputRef = useRef(null);

  useEffect(() => {
    if (user?.clubId && user?.clubRole !== "owner") {
      if (navbarBrandInputRef.current) navbarBrandInputRef.current.value = user.clubName || "";
      return;
    }
    if (brandDraft !== null && navbarBrandDirtyRef.current) {
      setNavbarBrandName(brandDraft);
      if (navbarBrandInputRef.current) navbarBrandInputRef.current.value = brandDraft;
      return;
    }
    if (navbarBrandDirtyRef.current || savingNavbarBrand) return;
    const nextName = user?.settings?.navbarBrandName || "";
    setNavbarBrandName(nextName);
    if (navbarBrandInputRef.current) {
      navbarBrandInputRef.current.value = nextName;
    }
  }, [brandDraft, savingNavbarBrand, user?.settings?.navbarBrandName, user?.clubId, user?.clubRole, user?.clubName]);

  const navbarBrandIncluded = canUseNavbarBranding(
    user?.proAccess || {
      packageKey: user?.packageKey,
      packageTier: user?.packageTier,
      branding: user?.branding,
    }
  );
  const navbarBrandAllowed = !isClubMember && navbarBrandIncluded;

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
      setBrandDraft(null);
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

  return (
          <AppSurface {...surfaceCardProps} p={{ base: 5, md: 6 }}>
            <HStack spacing={3} mb={4} align="flex-start">
              <Circle size="42px" bg="rgba(139,92,246,0.10)" color="#8B5CF6" flexShrink={0}>
                <Icon as={MdOutlineBadge} boxSize="20px" />
              </Circle>
              <Box minW={0}>
                <HStack spacing={2} wrap="wrap">
                  <Heading as="h2" size="md" color={textColor}>{t("auto.SettingsPageCoach.nom_dans_la_navigation", "Nom dans la navigation")}</Heading>
                  <PlanInclusionBadge included={navbarBrandIncluded} />
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
                  key={isClubMember ? user?.clubName : "personal-brand"}
                  defaultValue={isClubMember ? user?.clubName || "" : navbarBrandName}
                  onChange={(event) => {
                    navbarBrandDirtyRef.current = true;
                    setBrandDraft(event.target.value);
                  }}
                  maxLength={48}
                  placeholder="BoostYourLife.coach"
                  borderRadius="full"
                  bg={subCardBg}
                />
              </FormControl>
              <Button
                type="button"
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
          </AppSurface>

  );
}
