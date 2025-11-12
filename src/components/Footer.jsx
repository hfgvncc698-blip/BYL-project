// src/components/Footer.jsx
import React from "react";
import { Box, Flex, Link, Text, SimpleGrid, useColorModeValue } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();

  const bg = useColorModeValue("gray.100", "gray.900");
  const color = useColorModeValue("gray.600", "gray.300");
  const linkColor = useColorModeValue("gray.700", "gray.200");
  const linkHover = useColorModeValue("blue.600", "blue.300");

  return (
    <Box as="footer" bg={bg} color={color} py={{ base: 4, md: 6 }} mt={{ base: 6, md: 8 }}>
      <Flex
        maxW="1200px"
        mx="auto"
        direction="column"
        align="center"
        justify="center"
        px={{ base: 3, md: 4 }}
        textAlign="center"
      >
        {/* Liens : compacts en 2 colonnes sur mobile, 5 colonnes sur desktop */}
        <SimpleGrid
          columns={{ base: 2, md: 5 }}
          spacing={{ base: 2, md: 4 }}
          mb={{ base: 3, md: 4 }}
          w="full"
          maxW="700px"
        >
          <Link href="/about" color={linkColor} _hover={{ color: linkHover }} fontSize="sm">
            {t("footer.about")}
          </Link>
          <Link href="/contact" color={linkColor} _hover={{ color: linkHover }} fontSize="sm">
            {t("footer.contact")}
          </Link>
          <Link href="/privacy" color={linkColor} _hover={{ color: linkHover }} fontSize="sm">
            {t("footer.privacy")}
          </Link>
          <Link href="/terms" color={linkColor} _hover={{ color: linkHover }} fontSize="sm">
            {t("footer.terms")}
          </Link>
          <Link href="/sales-policy" color={linkColor} _hover={{ color: linkHover }} fontSize="sm">
            {t("footer.sales")}
          </Link>
        </SimpleGrid>

        {/* Copyright */}
        <Text fontSize={{ base: "xs", md: "sm" }} lineHeight="short">
          © 2025 BoostYourLife — {t("footer.rights")}
        </Text>
      </Flex>
    </Box>
  );
}

export default Footer;

