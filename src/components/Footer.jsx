// src/components/Footer.jsx
import React from "react";
import { Box, Flex, Link, Text, SimpleGrid } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../styles/appTheme";

export function Footer() {
  const { t } = useTranslation();
  const theme = useAppTheme();

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
        {/* Liens : compacts en 2 colonnes sur mobile, 6 colonnes sur desktop */}
        <SimpleGrid
          columns={{ base: 2, md: 6 }}
          spacing={{ base: 2, md: 4 }}
          mb={{ base: 3, md: 4 }}
          w="full"
          maxW="900px"
        >
          <Link href="/about" color={theme.textColor} _hover={{ color: theme.accentBlue }} fontSize="sm">
            {t("footer.about")}
          </Link>

          {/* ✅ Tarifs -> page Plan Pro (pricing centralisé) */}
          <Link href="/plans/professionnel" color={theme.textColor} _hover={{ color: theme.accentBlue }} fontSize="sm">
            {t("footer.pricing", "Tarifs")}
          </Link>

          <Link href="/contact" color={theme.textColor} _hover={{ color: theme.accentBlue }} fontSize="sm">
            {t("footer.contact")}
          </Link>

          <Link href="/privacy" color={theme.textColor} _hover={{ color: theme.accentBlue }} fontSize="sm">
            {t("footer.privacy")}
          </Link>

          <Link href="/terms" color={theme.textColor} _hover={{ color: theme.accentBlue }} fontSize="sm">
            {t("footer.terms")}
          </Link>

          <Link href="/sales-policy" color={theme.textColor} _hover={{ color: theme.accentBlue }} fontSize="sm">
            {t("footer.sales")}
          </Link>
        </SimpleGrid>

        {/* Copyright */}
        <Text fontSize={{ base: "xs", md: "sm" }} lineHeight="short">
          © {new Date().getFullYear()} BoostYourLife — {t("footer.rights")}
        </Text>
      </Flex>
    </Box>
  );
}

export default Footer;
