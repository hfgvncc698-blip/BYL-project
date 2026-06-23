// src/components/Footer.jsx
import React from "react";
import { Box, Flex, Link, Text, SimpleGrid, VStack } from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../styles/appTheme";
import { SEO_PUBLIC_LINKS, seoHrefForPath } from "../seo/seoConfig";

export function Footer() {
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const activeLng = (i18n.resolvedLanguage || i18n.language || "fr").split("-")[0];
  const hrefFor = (href) => {
    const canonicalHref = seoHrefForPath(href);
    return activeLng && activeLng !== "fr" ? `${canonicalHref}?lng=${activeLng}` : canonicalHref;
  };
  const mainLinks = SEO_PUBLIC_LINKS.filter((link) =>
    ["/plans/professionnel", "/about", "/contact", "/privacy", "/terms", "/sales-policy"].includes(link.href)
  );
  const resourceLinks = SEO_PUBLIC_LINKS.filter((link) =>
    [
      "/logiciel-coach-sportif",
      "/application-coach-sportif",
      "/logiciel-suivi-client-coach",
      "/application-coaching-nutrition",
      "/logiciel-nutritionniste",
      "/logiciel-coach-sportif-nutrition",
      "/logiciel-club-sport",
      "/logiciel-salle-de-sport",
    ].includes(link.href)
  );

  return (
    <Box
      as="footer"
      {...theme.cardProps}
      color={theme.mutedText}
      py={{ base: 4, md: 6 }}
      mt={{ base: 6, md: 8 }}
      mx={{ base: 3, md: 6 }}
      mb={{ base: 3, md: 5 }}
    >
      <Flex
        maxW="1200px"
        mx="auto"
        direction="column"
        align="center"
        justify="center"
        px={{ base: 3, md: 4 }}
        textAlign="center"
      >
        {/* Liens principaux visibles. */}
        <SimpleGrid
          columns={{ base: 2, md: 6 }}
          spacing={{ base: 2, md: 4 }}
          mb={{ base: 3, md: 4 }}
          w="full"
          maxW="900px"
        >
          {mainLinks.map((link) => (
            <Link
              key={link.href}
              as={RouterLink}
              to={hrefFor(link.href)}
              color={theme.textColor}
              _hover={{ color: theme.accentBlue }}
              fontSize="sm"
            >
              {link.href === "/about"
                ? t("footer.about")
                : link.href === "/plans/professionnel"
                ? t("footer.pricing", "Tarifs")
                : link.href === "/contact"
                ? t("footer.contact")
                : link.href === "/privacy"
                ? t("footer.privacy")
                : link.href === "/terms"
                ? t("footer.terms")
                : link.href === "/sales-policy"
                ? t("footer.sales")
                : link.label}
            </Link>
          ))}
        </SimpleGrid>

        <VStack spacing={2} mb={{ base: 3, md: 4 }}>
          <Text fontSize="xs" color={theme.subtleText} fontWeight="800" textTransform="uppercase">
            {t("footer.resources", "Ressources")}
          </Text>
          <Flex gap={{ base: 2, md: 3 }} justify="center" wrap="wrap" maxW="900px">
            {resourceLinks.map((link) => (
              <Link
                key={link.href}
                as={RouterLink}
                to={hrefFor(link.href)}
                color={theme.subtleText}
                _hover={{ color: theme.accentBlue }}
                fontSize="xs"
              >
                {link.href === "/logiciel-coach-sportif"
                  ? t("footer.resourcesCoachSport", "Logiciel coach sportif")
                  : link.href === "/application-coach-sportif"
                  ? t("footer.resourcesCoachApp", "Application coach sportif")
                  : link.href === "/logiciel-suivi-client-coach"
                  ? t("footer.resourcesClientTracking", "Suivi client coach")
                  : link.href === "/application-coaching-nutrition"
                  ? t("footer.resourcesNutrition", "Coaching nutrition")
                  : link.href === "/logiciel-nutritionniste"
                  ? t("footer.resourcesNutritionist", "Logiciel nutritionniste")
                  : link.href === "/logiciel-coach-sportif-nutrition"
                  ? t("footer.resourcesSportNutrition", "Sport et nutrition")
                  : link.href === "/logiciel-club-sport"
                  ? t("footer.resourcesClub", "Logiciel club de sport")
                  : link.href === "/logiciel-salle-de-sport"
                  ? t("footer.resourcesGym", "Logiciel salle de sport")
                  : link.label}
              </Link>
            ))}
          </Flex>
        </VStack>

        {/* Copyright */}
        <Text fontSize={{ base: "xs", md: "sm" }} lineHeight="short">
          © {new Date().getFullYear()} BoostYourLife — {t("footer.rights")}
        </Text>
      </Flex>
    </Box>
  );
}

export default Footer;
