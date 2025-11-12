// src/components/HomePage.jsx
import React from "react";
import {
  Box, Container, Heading, Text, SimpleGrid, VStack, Button, Badge,
  useColorModeValue
} from "@chakra-ui/react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation, Trans } from "react-i18next";
import { useAuth } from "../AuthContext";

const MotionBox = motion(Box);
const MotionVStack = motion(VStack);

// ⬇️ Image strictement locale (placée dans /public)
const HERO_URL = "/hero-bg.png";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, startCoachTrialIfNeeded } = useAuth();
  const { t } = useTranslation("common");

  const bgHero = useColorModeValue("white", "gray.900");
  const bgHow = useColorModeValue("gray.50", "gray.900");
  const bgPlans = useColorModeValue("white", "gray.800");
  const cardBg = useColorModeValue("white", "gray.800");
  const cardShadow = useColorModeValue("0 8px 40px 0 rgba(20,40,80,0.11)", "0 2px 8px 0 rgba(0,0,0,0.13)");
  const cardBorder = useColorModeValue("1.5px solid #E5E7EB", "1.5px solid #2D3748");
  const textColor = useColorModeValue("gray.50", "gray.100");
  const mutedText = useColorModeValue("gray.200", "gray.300");
  const bodyText = useColorModeValue("gray.900", "gray.100");
  const subText = useColorModeValue("gray.600", "gray.300");
  const badgeBg = useColorModeValue("blue.100", "blue.900");
  const badgeText = useColorModeValue("blue.700", "blue.100");
  const btnBlue = useColorModeValue("blue.600", "blue.300");
  const btnBlueHover = useColorModeValue("blue.700", "blue.200");

  const outlineBtn = {
    border: "2px solid",
    borderColor: btnBlue,
    color: btnBlue,
    bg: "transparent",
    fontWeight: "bold",
    _hover: {
      bg: useColorModeValue("whiteAlpha.700", "whiteAlpha.200"),
      color: btnBlueHover,
      borderColor: btnBlueHover
    },
  };

  async function startTrialNow() {
    if (!user) {
      navigate("/register?next=/coach-dashboard&role=coach");
      return;
    }
    await startCoachTrialIfNeeded(user.uid);
    navigate("/coach-dashboard", { replace: true });
  }

  return (
    <Box as="section" minH="100vh" bg={bgHero}>
      {/* ======= HERO ======= */}
      <Box
        position="relative"
        _before={{
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage: `url("${HERO_URL}")`, // ⬅️ uniquement l’asset local
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        _after={{
          content: '""',
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.45) 35%, rgba(0,0,0,0.65) 100%)",
        }}
      >
        <Container maxW="container.xl" position="relative" zIndex={1}>
          <MotionVStack
            spacing={6}
            align="center"
            textAlign="center"
            py={{ base: 16, md: 24 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Heading as="h1" lineHeight="1.1" fontWeight="extrabold" color={textColor}
              fontSize={{ base: "2.5rem", md: "4rem" }} letterSpacing="-0.02em">
              {t("hero.title1")}
            </Heading>
            <Heading as="h2" color="blue.300" fontWeight="extrabold"
              fontSize={{ base: "2rem", md: "3rem" }} letterSpacing="-0.02em">
              {t("hero.title2")}
            </Heading>
            <Text maxW="880px" color={mutedText} fontSize={{ base: "lg", md: "xl" }} mt={1}>
              {t("hero.subtitle")}
            </Text>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} w="full" maxW="880px" mt={2}>
              <MotionBox initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.45 }}>
                <VStack>
                  <Button
                    as={RouterLink}
                    to="/register"
                    size="lg"
                    colorScheme="blue"
                    variant="solid"
                    w="100%"
                    fontWeight="bold"
                    borderRadius="xl"
                    bg={btnBlue}
                    _hover={{ bg: btnBlueHover }}
                  >
                    {t("hero.ctaClient")}
                  </Button>
                  <Text fontSize="sm" color={mutedText}>
                    <Trans i18nKey="hero.clientHint">
                      100% gratuit, suivi illimité, <strong>1 programme premium</strong> offert.
                    </Trans>
                  </Text>
                </VStack>
              </MotionBox>

              <MotionBox initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.45 }}>
                <VStack>
                  <Button
                    size="lg"
                    w="100%"
                    borderRadius="xl"
                    {...outlineBtn}
                    onClick={startTrialNow}
                  >
                    {t("hero.ctaCoach")}
                  </Button>
                  <Text fontSize="sm" color={mutedText}>
                    {t("hero.coachHint")}
                  </Text>
                </VStack>
              </MotionBox>
            </SimpleGrid>

            <MotionBox initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.45 }}>
              <Button
                as={RouterLink}
                to="/programmes-premium"
                size="md"
                borderRadius="xl"
                fontWeight="bold"
                bg="whiteAlpha.300"
                color="white"
                px={6}
                py={5}
                _hover={{ bg: "whiteAlpha.500", textDecoration: "none" }}
              >
                {t("hero.ctaPremium")}
              </Button>
            </MotionBox>
          </MotionVStack>
        </Container>
      </Box>

      {/* ======= HOW IT WORKS ======= */}
      <Box py={16} px={4} bg={bgHow}>
        <Container maxW="container.xl">
          <Heading textAlign="center" mb={8} fontSize="2xl" color={bodyText} fontWeight="bold">
            {t("how.title")}
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8}>
            <VStack align="start" bg={cardBg} boxShadow={cardShadow} borderRadius="2xl" p={8}
              spacing={4} color={bodyText} border={cardBorder} minH="220px">
              <Heading size="md" fontWeight="bold">{t("how.coach.title")}</Heading>
              <Text color={subText}>{t("how.coach.l1")}</Text>
              <Text color={subText}>{t("how.coach.l2")}</Text>
              <Text color={subText}>{t("how.coach.l3")}</Text>
            </VStack>

            <VStack align="start" bg={cardBg} boxShadow={cardShadow} borderRadius="2xl" p={8}
              spacing={4} color={bodyText} border={cardBorder} minH="220px">
              <Heading size="md" fontWeight="bold">{t("how.client.title")}</Heading>
              <Text color={subText}>{t("how.client.l1")}</Text>
              <Text color={subText}>
                <Trans i18nKey="how.client.l2">
                  1 programme <strong>premium</strong> offert à l’inscription.
                </Trans>
              </Text>
              <Text color={subText}>{t("how.client.l3")}</Text>
            </VStack>
          </SimpleGrid>
        </Container>
      </Box>

      {/* ======= PLANS ======= */}
      <Box id="plans" py={16} px={4} bg={bgPlans}>
        <Container maxW="container.xl">
          <Heading textAlign="center" mb={8} fontSize="2xl" color={bodyText} fontWeight="bold">
            {t("plans.title")}
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
            {/* Free */}
            <Box
              bg={cardBg} borderRadius="2xl" p={8}
              boxShadow={cardShadow} border={cardBorder} display="flex" flexDir="column"
              position="relative" alignItems="start" transition="all 0.13s"
              _hover={{ boxShadow: "0 16px 48px 0 rgba(20,40,80,0.15)" }} justifyContent="space-between"
            >
              <Badge variant="subtle" bg={badgeBg} color={badgeText} fontWeight="semibold"
                fontSize="0.89em" px={2.5} py={1} borderRadius="md" mb={2} position="absolute"
                top={5} left={6} zIndex={1} minW="110px" textAlign="center">
                {t("plans.free.badge")}
              </Badge>
              <Box pt={7} w="100%">
                <Heading size="md" mb={4} fontWeight="bold" color={bodyText}>{t("plans.free.title")}</Heading>
                <Text mb={6} color={subText}>
                  <Trans i18nKey="plans.free.desc">
                    Accès complet et suivi gratuit. 1 programme <strong>premium</strong> offert.
                    Débloquez ensuite des programmes premium au choix.
                  </Trans>
                </Text>
              </Box>
              <Button
                as={RouterLink}
                to="/register"
                colorScheme="blue"
                size="md"
                borderRadius="xl"
                fontWeight="bold"
                w="100%"
                mt="auto"
                bg={btnBlue}
                _hover={{ bg: btnBlueHover }}
              >
                {t("plans.free.cta")}
              </Button>
            </Box>

            {/* Pro */}
            <Box
              bg={cardBg} borderRadius="2xl" p={8}
              boxShadow={cardShadow} border={cardBorder} display="flex" flexDir="column"
              position="relative" alignItems="start" transition="all 0.13s"
              _hover={{ boxShadow: "0 16px 48px 0 rgba(20,40,80,0.15)" }} justifyContent="space-between"
            >
              <Badge variant="subtle" bg={badgeBg} color={badgeText} fontWeight="semibold"
                fontSize="0.89em" px={2.5} py={1} borderRadius="md" mb={2} position="absolute"
                top={5} left={6} zIndex={1} minW="110px" textAlign="center">
                {t("plans.pro.badge")}
              </Badge>
              <Box pt={7} w="100%">
                <Heading size="md" mb={4} fontWeight="bold" color={bodyText}>{t("plans.pro.title")}</Heading>
                <Text mb={6} color={subText}>{t("plans.pro.desc")}</Text>
              </Box>
              <Button
                size="md"
                borderRadius="xl"
                fontWeight="bold"
                w="100%"
                mt="auto"
                border="2px solid"
                borderColor={btnBlue}
                color={btnBlue}
                bg="transparent"
                _hover={{ bg: useColorModeValue("whiteAlpha.700", "whiteAlpha.200"), color: btnBlueHover, borderColor: btnBlueHover }}
                onClick={startTrialNow}
              >
                {t("plans.pro.cta")}
              </Button>
            </Box>

            {/* Premium */}
            <Box
              bg={cardBg} borderRadius="2xl" p={8}
              boxShadow={cardShadow} border={cardBorder} display="flex" flexDir="column"
              position="relative" alignItems="start" transition="all 0.13s"
              _hover={{ boxShadow: "0 16px 48px 0 rgba(20,40,80,0.15)" }} justifyContent="space-between"
            >
              <Badge variant="subtle" bg={badgeBg} color={badgeText} fontWeight="semibold"
                fontSize="0.89em" px={2.5} py={1} borderRadius="md" mb={2} position="absolute"
                top={5} left={6} zIndex={1} minW="110px" textAlign="center">
                {t("plans.premium.badge")}
              </Badge>
              <Box pt={7} w="100%">
                <Heading size="md" mb={4} fontWeight="bold" color={bodyText}>{t("plans.premium.title")}</Heading>
                <Text mb={6} color={subText}>{t("plans.premium.desc")}</Text>
              </Box>
              <Button
                as={RouterLink}
                to="/programmes-premium"
                size="md"
                borderRadius="xl"
                fontWeight="bold"
                w="100%"
                mt="auto"
                bg={useColorModeValue("blue.50", "blue.900")}
                color={useColorModeValue("blue.700", "blue.200")}
                _hover={{ bg: useColorModeValue("blue.100", "blue.700"), color: useColorModeValue("blue.900", "white"), textDecoration: "none" }}
              >
                {t("plans.premium.cta")}
              </Button>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>
    </Box>
  );
}

