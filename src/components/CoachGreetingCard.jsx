import React, { useMemo, useState } from "react";
import {
  Box, Flex, HStack, VStack, Text, Image, Button,
  useColorModeValue, SkeletonCircle, SkeletonText
} from "@chakra-ui/react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

/** Initiales à partir du prénom/nom (fallback logo) */
function getInitials(a = "", b = "") {
  const A = (a || "").trim();
  const B = (b || "").trim();
  if (!A && !B) return "BYL";
  return `${A?.[0] ?? ""}${B?.[0] ?? ""}`.toUpperCase();
}

/** Sous-ligne adaptée à l’heure locale (i18n) */
function sublineByHour(t, date = new Date()) {
  const h = date.getHours();
  if (h < 6)  return t("greeting.subline.night");
  if (h < 12) return t("greeting.subline.morning");
  if (h < 18) return t("greeting.subline.afternoon");
  return t("greeting.subline.evening");
}

export default function CoachGreetingCard({
  firstName,
  lastName,
  logoUrl,
  primaryColor = "#3182ce",
  loading = false,
}) {
  const { t } = useTranslation();

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const subtle = useColorModeValue("gray.600", "gray.300");
  const logoBg = useColorModeValue("white", "gray.700");
  const initialsBg = useColorModeValue("blue.50", "blue.900");
  const initialsColor = useColorModeValue("blue.700", "blue.100");
  const ring = `0 0 0 3px ${primaryColor}33`; // halo léger
  const [logoAspectRatio, setLogoAspectRatio] = useState(null);
  const logoFrameSize = useMemo(() => {
    const ratio = Number(logoAspectRatio || 1);
    if (ratio >= 2.2) return { w: { base: "76px", md: "112px" }, h: { base: "48px", md: "64px" } };
    if (ratio >= 1.35) return { w: { base: "64px", md: "92px" }, h: { base: "48px", md: "64px" } };
    if (ratio <= 0.58) return { w: { base: "48px", md: "64px" }, h: { base: "64px", md: "84px" } };
    if (ratio <= 0.82) return { w: { base: "48px", md: "64px" }, h: { base: "56px", md: "74px" } };
    return { w: { base: "48px", md: "64px" }, h: { base: "48px", md: "64px" } };
  }, [logoAspectRatio]);

  const name = (firstName || t("greeting.coach")).trim();

  return (
    <Box
      role="region"
      aria-label={t("greeting.card_aria")}
      bg={cardBg}
      border="1px solid"
      borderColor={border}
      borderRadius="xl"
      p={{ base: 4, md: 6 }}
      mb={4}
      boxShadow="sm"
    >
      {loading ? (
        <HStack spacing={{ base: 3, md: 4 }}>
          <SkeletonCircle boxSize={{ base: "48px", md: "56px" }} />
          <SkeletonText noOfLines={2} w="60%" />
        </HStack>
      ) : (
        <Flex
          align={{ base: "flex-start", md: "center" }}
          justify="space-between"
          gap={{ base: 3, md: 4 }}
          direction={{ base: "column", md: "row" }}
        >
          <HStack align="center" spacing={{ base: 3, md: 4 }}>
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={t("greeting.logo_alt", { name: `${firstName ?? ""} ${lastName ?? ""}`.trim() })}
                w={logoFrameSize.w}
                h={logoFrameSize.h}
                objectFit="contain"
                maxW={logoFrameSize.w}
                maxH={logoFrameSize.h}
                borderRadius="md"
                boxShadow={ring}
                bg={logoBg}
                p="1"
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) {
                    setLogoAspectRatio(img.naturalWidth / img.naturalHeight);
                  }
                }}
              />
            ) : (
              <Flex
                boxSize={{ base: "48px", md: "64px" }}
                align="center"
                justify="center"
                borderRadius="md"
                fontWeight="bold"
                bg={initialsBg}
                color={initialsColor}
                boxShadow={ring}
              >
                {getInitials(firstName, lastName)}
              </Flex>
            )}

            <VStack align="start" spacing={0}>
              <Text as="h2" fontSize={{ base: "xl", md: "2xl" }} fontWeight="extrabold" lineHeight="1.25">
                {t("greeting.hello_name", { name })} 👋
              </Text>
              <Text fontSize={{ base: "sm", md: "md" }} color={subtle}>
                {sublineByHour(t)}
              </Text>
            </VStack>
          </HStack>

          {!logoUrl && (
            <Button
              as={Link}
              to="/coach/profile"
              size="sm"
              colorScheme="blue"
              alignSelf={{ base: "flex-start", md: "center" }}
            >
              {t("greeting.add_logo")}
            </Button>
          )}
        </Flex>
      )}
    </Box>
  );
}
