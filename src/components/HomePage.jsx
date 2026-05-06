// src/pages/HomePage.jsx
import React from "react";
import {
  Box,
  Container,
  Heading,
  Text,
  SimpleGrid,
  VStack,
  HStack,
  Button,
  useColorModeValue,
  Divider,
  Icon,
  List,
  ListItem,
  ListIcon,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Badge,
  Circle,
  Flex,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircleIcon } from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";
import {
  MdOutlineArrowDownward,
  MdOutlineAutoAwesome,
  MdOutlineCalendarMonth,
  MdOutlineGroups,
  MdOutlineInsights,
  MdOutlinePlayCircle,
  MdOutlineRocketLaunch,
  MdOutlineTimer,
} from "react-icons/md";

const MotionVStack = motion(VStack);

// Images locales (public/)
import MOCKUP_URL from "../assets/Mockup.png";

const HERO_URL = "/hero-bg.png";
const stripStepPrefix = (text = "") => String(text).replace(/^\s*\d+\)\s*/, "");

function FeatureCard({ title, desc, icon, accent = "blue.500" }) {
  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("1px solid #E5E7EB", "1px solid #2D3748");
  const cardShadow = useColorModeValue(
    "0 10px 40px rgba(20,40,80,0.12)",
    "0 12px 40px rgba(0,0,0,0.45)"
  );
  const bodyText = useColorModeValue("gray.900", "gray.100");
  const subText = useColorModeValue("gray.600", "gray.300");

  return (
    <Box
      bg={cardBg}
      border={cardBorder}
      boxShadow={cardShadow}
      borderRadius="28px"
      p={{ base: 6, md: 7 }}
      position="relative"
      overflow="hidden"
      transition="all 0.15s"
      _hover={{
        transform: "translateY(-2px)",
        boxShadow: "0 16px 48px rgba(20,40,80,0.18)",
      }}
      _before={{
        content: '""',
        position: "absolute",
        right: "-16px",
        top: "-16px",
        w: "120px",
        h: "120px",
        borderRadius: "full",
        bg: useColorModeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.12)"),
        filter: "blur(26px)",
      }}
    >
      <VStack align="start" spacing={3} position="relative" zIndex={1}>
        <Circle size="42px" bg={`${accent}22`} color={accent}>
          <Icon as={icon} boxSize="20px" />
        </Circle>
        <Heading size="sm" color={bodyText} fontWeight="extrabold">
          {title}
        </Heading>
        <Text color={subText} lineHeight="1.7">
          {desc}
        </Text>
      </VStack>
    </Box>
  );
}

function SalesCard({ title, desc, icon, accent = "blue.500" }) {
  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("1px solid #E5E7EB", "1px solid #2D3748");
  const cardShadow = useColorModeValue(
    "0 12px 44px rgba(20,40,80,0.14)",
    "0 12px 44px rgba(0,0,0,0.45)"
  );
  const bodyText = useColorModeValue("gray.900", "gray.100");
  const subText = useColorModeValue("gray.600", "gray.300");

  return (
    <Box
      bg={cardBg}
      border={cardBorder}
      boxShadow={cardShadow}
      borderRadius="28px"
      p={{ base: 6, md: 7 }}
      position="relative"
      overflow="hidden"
    >
      <VStack align="start" spacing={3} position="relative" zIndex={1}>
        <Circle size="42px" bg={`${accent}22`} color={accent}>
          <Icon as={icon} boxSize="20px" />
        </Circle>
        <Heading size="sm" color={bodyText} fontWeight="extrabold">
          {title}
        </Heading>
        <Text color={subText} lineHeight="1.7">
          {desc}
        </Text>
      </VStack>
    </Box>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, startCoachTrialIfNeeded } = useAuth();
  const { t } = useTranslation();

  const bgHero = useColorModeValue("white", "gray.900");
  const bgSection = useColorModeValue("white", "gray.800");
  const bgSoft = useColorModeValue("gray.50", "gray.900");
  const softButtonHover = useColorModeValue("rgba(255,255,255,0.16)", "rgba(255,255,255,0.14)");

  const bodyText = useColorModeValue("gray.900", "gray.100");
  const subText = useColorModeValue("gray.600", "gray.300");
  const mutedText = useColorModeValue("gray.200", "gray.400");
  const surfaceStrong = useColorModeValue("rgba(255,255,255,0.92)", "rgba(15,23,42,0.82)");
  const sectionBorder = useColorModeValue("1px solid rgba(15,23,42,0.08)", "1px solid rgba(255,255,255,0.10)");
  const sectionShadow = useColorModeValue("0 18px 54px rgba(15,23,42,0.10)", "0 20px 60px rgba(0,0,0,0.36)");
  const promiseSurface = useColorModeValue(
    "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(37,99,235,0.88))",
    "linear-gradient(135deg, rgba(2,6,23,0.98), rgba(30,64,175,0.90))"
  );
  const promiseBorder = useColorModeValue("1px solid rgba(37,99,235,0.18)", "1px solid rgba(96,165,250,0.18)");
  const mockupFrameBorder = useColorModeValue("1px solid #E5E7EB", "1px solid rgba(255,255,255,0.12)");
  const mockupFrameShadow = useColorModeValue("0 24px 70px rgba(0,0,0,0.20)", "0 24px 70px rgba(0,0,0,0.55)");
  const accordionBg = useColorModeValue("rgba(255,255,255,0.9)", "rgba(17,24,39,0.92)");
  const accordionHover = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.04)");
  const coachSteps = [
    t("homePro.how.coach.steps.s1"),
    t("homePro.how.coach.steps.s2"),
    t("homePro.how.coach.steps.s3"),
  ];
  const coachGains = [
    t("homePro.how.coach.gains.g1"),
    t("homePro.how.coach.gains.g2"),
    t("homePro.how.coach.gains.g3"),
  ];
  const studentSteps = [
    t("homePro.how.student.steps.s1"),
    t("homePro.how.student.steps.s2"),
    t("homePro.how.student.steps.s3"),
  ];
  const studentBenefits = [
    t("homePro.how.student.benefits.b1"),
    t("homePro.how.student.benefits.b2"),
    t("homePro.how.student.benefits.b3"),
  ];
  const btnBlueSoft = useColorModeValue("#2F6CB3", "#63B3ED");
  const btnBlueSoftHover = useColorModeValue("#285E9E", "#7CC1F1");

  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("1px solid #E5E7EB", "1px solid #2D3748");
  const cardShadow = useColorModeValue(
    "0 10px 40px rgba(20,40,80,0.12)",
    "0 12px 40px rgba(0,0,0,0.45)"
  );

  // ✅ Style “CTA long” : texte toujours visible sur mobile
  const ctaButtonProps = {
    borderRadius: "xl",
    bg: btnBlueSoft,
    color: "white",
    fontWeight: "extrabold",
    _hover: { bg: btnBlueSoftHover, transform: "translateY(-1px)" },
    transition: "all 0.15s",
    w: { base: "100%", md: "auto" },
    h: "auto",
    py: { base: 4.5, md: 3.5 },
    px: { base: 6, md: 10 },
    whiteSpace: "normal",            // wrap
    textAlign: "center",
    lineHeight: "1.15",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    fontSize: { base: "md", md: "lg" }, // évite “coupé” sur petits écrans
    boxShadow: "0 12px 34px rgba(47,108,179,0.24)",
  };

  async function startTrialNow() {
    if (!user) {
      navigate("/register?next=/coach-dashboard&role=coach");
      return;
    }
    await startCoachTrialIfNeeded(user.uid);
    navigate("/coach-dashboard", { replace: true });
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const faqKeys = ["q1", "q2", "q3", "q4", "q5", "q6"];

  return (
    <Box as="section" minH="100vh" bg={bgHero}>
      {/* ================= HERO ================= */}
      <Box
        position="relative"
        _before={{
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage: `url("${HERO_URL}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        _after={{
          content: '""',
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.78) 48%, rgba(0,0,0,0.92) 100%)",
        }}
      >
        <Container maxW="container.xl" position="relative" zIndex={1}>
          <MotionVStack
            spacing={{ base: 9, md: 11 }}
            align="stretch"
            textAlign="center"
            py={{ base: 18, md: 22, xl: 26 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <VStack align="center" spacing={{ base: 6, md: 7 }} w="full">
              <Heading
                as="h1"
                lineHeight={{ base: "1.02", md: "0.96" }}
                fontWeight="extrabold"
                color="white"
                fontSize={{ base: "2.9rem", md: "4.55rem", xl: "5.3rem" }}
                letterSpacing="-0.05em"
                maxW={{ base: "12ch", md: "none" }}
                mx="auto"
              >
                <Text as="span" display="block" whiteSpace={{ base: "normal", lg: "nowrap" }}>
                  {t("homePro.hero.titleLine1")}
                </Text>
                <Text as="span" display="block" whiteSpace={{ base: "normal", lg: "nowrap" }}>
                  {t("homePro.hero.titleLine2")}
                </Text>
              </Heading>

              <VStack spacing={{ base: 4, md: 5 }} align="center" w="full" maxW="1120px">
                <Text
                  maxW="760px"
                  mx="auto"
                  color="whiteAlpha.900"
                  fontSize={{ base: "lg", md: "xl", xl: "1.7rem" }}
                  lineHeight={{ base: "1.55", md: "1.6" }}
                  fontWeight="medium"
                >
                  {t("homePro.hero.subtitle")}
                </Text>

                <Box
                  w="full"
                  maxW="1080px"
                  border="1px solid rgba(255,255,255,0.16)"
                  bg="rgba(7,10,18,0.18)"
                  borderRadius="24px"
                  px={{ base: 5, md: 8 }}
                  py={{ base: 4, md: 5 }}
                  backdropFilter="blur(10px)"
                >
                  <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 4, md: 6 }} textAlign="left">
                    <HStack align="start" spacing={3}>
                      <Icon as={CheckCircleIcon} color="blue.300" mt={1} />
                      <Box>
                        <Text color="white" fontWeight="extrabold">
                          {t("homePro.hero.proofs.p1.title")}
                        </Text>
                        <Text color={mutedText} fontSize="sm">
                          {t("homePro.hero.proofs.p1.desc")}
                        </Text>
                      </Box>
                    </HStack>

                    <HStack align="start" spacing={3}>
                      <Icon as={CheckCircleIcon} color="blue.300" mt={1} />
                      <Box>
                        <Text color="white" fontWeight="extrabold">
                          {t("homePro.hero.proofs.p2.title")}
                        </Text>
                        <Text color={mutedText} fontSize="sm">
                          {t("homePro.hero.proofs.p2.desc")}
                        </Text>
                      </Box>
                    </HStack>

                    <HStack align="start" spacing={3}>
                      <Icon as={CheckCircleIcon} color="blue.300" mt={1} />
                      <Box>
                        <Text color="white" fontWeight="extrabold">
                          {t("homePro.hero.proofs.p3.title")}
                        </Text>
                        <Text color={mutedText} fontSize="sm">
                          {t("homePro.hero.proofs.p3.desc")}
                        </Text>
                      </Box>
                    </HStack>
                  </SimpleGrid>
                </Box>

                <VStack align="stretch" spacing={2.5} w="full" maxW={{ base: "100%", md: "32rem" }} mx="auto">
                  <Button size="lg" onClick={startTrialNow} {...ctaButtonProps}>
                    {t("homePro.hero.cta")}
                  </Button>

                  <HStack spacing={3} wrap="wrap" color={mutedText} fontSize="sm" justify="center">
                    <HStack spacing={2}>
                      <Icon as={CheckCircleIcon} color="blue.200" />
                      <Text>{t("homePro.hero.hint")}</Text>
                    </HStack>
                  </HStack>

                  <Button
                    variant="ghost"
                    onClick={() => scrollToId("pro")}
                    alignSelf={{ base: "stretch", md: "center" }}
                    leftIcon={<MdOutlineArrowDownward />}
                    color="blue.100"
                    bg="transparent"
                    _hover={{ bg: "rgba(255,255,255,0.08)", color: "white" }}
                    borderRadius="full"
                    fontWeight="700"
                  >
                    {t("homePro.hero.scroll")}
                  </Button>
                </VStack>
              </VStack>
            </VStack>
          </MotionVStack>
        </Container>
      </Box>

      {/* ================= 2) CE QUE VOUS OBTENEZ ================= */}
      <Box id="pro" py={{ base: 16, md: 20 }} px={4} bg={bgSoft}>
        <Container maxW="container.xl">
          <VStack spacing={3} textAlign="center" mb={12}>
            <Text color="blue.500" fontWeight="800" letterSpacing="0.08em" textTransform="uppercase" fontSize="xs">
              Ce que vous obtenez
            </Text>
            <Heading fontSize={{ base: "2xl", md: "3xl" }} color={bodyText} fontWeight="extrabold" maxW="16ch">
              {t("homePro.benefits.title")}
            </Heading>
            <Text maxW="840px" color={subText} fontSize={{ base: "md", md: "lg" }}>
              {t("homePro.benefits.subtitle")}
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} maxW="1100px" mx="auto">
            <FeatureCard icon={MdOutlineRocketLaunch} accent="blue.500" title={t("homePro.benefits.cards.c1.title")} desc={t("homePro.benefits.cards.c1.desc")} />
            <FeatureCard icon={MdOutlineGroups} accent="cyan.500" title={t("homePro.benefits.cards.c2.title")} desc={t("homePro.benefits.cards.c2.desc")} />
            <FeatureCard icon={MdOutlineCalendarMonth} accent="green.500" title={t("homePro.benefits.cards.c3.title")} desc={t("homePro.benefits.cards.c3.desc")} />
            <FeatureCard icon={MdOutlineInsights} accent="purple.500" title={t("homePro.benefits.cards.c4.title")} desc={t("homePro.benefits.cards.c4.desc")} />
          </SimpleGrid>

          <Box
            mt={10}
            maxW="980px"
            mx="auto"
            bg={surfaceStrong}
            border={sectionBorder}
            boxShadow={sectionShadow}
            borderRadius="28px"
            p={{ base: 6, md: 7 }}
          >
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} alignItems="center">
              <Box textAlign={{ base: "center", md: "left" }}>
                <Heading size="md" color={bodyText} fontWeight="extrabold">
                  Passez de l’intérêt à l’essai en quelques minutes.
                </Heading>
                <Text mt={2} color={subText}>
                  Lancez un premier essai, découvrez l’interface complète et voyez immédiatement si elle colle à votre façon de coacher.
                </Text>
              </Box>
              <VStack align={{ base: "stretch", md: "flex-end" }} spacing={2}>
                <Button size="lg" onClick={startTrialNow} {...ctaButtonProps}>
                  {t("homePro.benefits.cta")}
                </Button>
                <Text fontSize="sm" color={subText}>
                  {t("homePro.benefits.hint")}
                </Text>
              </VStack>
            </SimpleGrid>
          </Box>
        </Container>
      </Box>

      {/* ================= 3) APERÇU PRODUIT (MOCKUP) ================= */}
      <Box id="mockup" py={{ base: 12, md: 18 }} px={4} bg={bgSection}>
        <Container maxW="container.xl">
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 10, lg: 12 }} alignItems="center">
            <VStack align="start" spacing={5}>
              <Text color="blue.500" fontWeight="800" letterSpacing="0.08em" textTransform="uppercase" fontSize="xs">
                Aperçu produit
              </Text>
              <Heading fontSize={{ base: "2xl", md: "3xl" }} color={bodyText} fontWeight="extrabold" maxW="14ch">
                {t("homePro.mockup.title")}
              </Heading>

              <Text color={subText} fontSize={{ base: "md", md: "lg" }} lineHeight="1.75">
                {t("homePro.mockup.p1")}
              </Text>

              <Text color={subText} fontSize={{ base: "md", md: "lg" }} lineHeight="1.75">
                {t("homePro.mockup.p2")}
              </Text>

              <HStack spacing={3} wrap="wrap">
                <Badge borderRadius="full" px={3} py={1.5} bg="rgba(59,130,246,0.10)" color="blue.600">
                  Vue coach claire
                </Badge>
                <Badge borderRadius="full" px={3} py={1.5} bg="rgba(16,185,129,0.10)" color="green.600">
                  Séances prêtes à lancer
                </Badge>
              </HStack>

              <VStack align="start" spacing={2}>
                <Button size="md" onClick={startTrialNow} {...ctaButtonProps}>
                  {t("homePro.mockup.cta")}
                </Button>
                <Text fontSize="sm" color={subText}>
                  {t("homePro.mockup.hint")}
                </Text>
              </VStack>
            </VStack>

            <Box
              mx="auto"
              w="full"
              maxW={{ base: "620px", lg: "860px" }}
              borderRadius={{ base: "2xl", md: "28px" }}
              overflow="hidden"
              border={mockupFrameBorder}
              boxShadow={mockupFrameShadow}
              position="relative"
            >
              <Box
                position="absolute"
                inset="0"
                bg="linear-gradient(to top, rgba(15,23,42,0.18), rgba(255,255,255,0))"
                pointerEvents="none"
                zIndex={1}
              />
              <Box as="img" src={MOCKUP_URL} alt={t("homePro.mockup.imageAlt")} w="100%" h="auto" display="block" />
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      {/* ================= 4) COMMENT ÇA MARCHE ================= */}
      <Box py={{ base: 16, md: 20 }} px={4} bg={bgSoft}>
        <Container maxW="container.xl">
          <VStack spacing={3} textAlign="center" mb={10}>
            <Text color="blue.500" fontWeight="800" letterSpacing="0.08em" textTransform="uppercase" fontSize="xs">
              Parcours simple
            </Text>
            <Heading textAlign="center" fontSize={{ base: "2xl", md: "3xl" }} color={bodyText} fontWeight="extrabold">
              {t("homePro.how.title")}
            </Heading>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8}>
            <VStack
              align="start"
              bg={cardBg}
              boxShadow={cardShadow}
              borderRadius="28px"
              p={8}
              spacing={4}
              color={bodyText}
              border={cardBorder}
            >
              <HStack spacing={3}>
                <Circle size="42px" bg="rgba(59,130,246,0.12)" color="blue.500">
                  <Icon as={MdOutlineGroups} boxSize="20px" />
                </Circle>
                <Heading size="md" fontWeight="extrabold">
                  {t("homePro.how.coach.title")}
                </Heading>
              </HStack>

                  {coachSteps.map((step, index) => (
                    <HStack key={step} align="start" spacing={3}>
                      <Circle size="28px" bg="rgba(59,130,246,0.10)" color="blue.500" fontSize="sm" fontWeight="800" flexShrink={0}>
                        {index + 1}
                      </Circle>
                      <Text color={subText}>{stripStepPrefix(step)}</Text>
                    </HStack>
                  ))}

              <Divider />

              <Text fontWeight="bold" color={bodyText}>
                {t("homePro.how.coach.gainTitle")}
              </Text>
              <List spacing={2} color={subText}>
                {coachGains.map((gain) => (
                  <ListItem key={gain}>
                    <ListIcon as={CheckCircleIcon} color="blue.400" />
                    {gain}
                  </ListItem>
                ))}
              </List>
            </VStack>

            <VStack
              align="start"
              bg={cardBg}
              boxShadow={cardShadow}
              borderRadius="28px"
              p={8}
              spacing={4}
              color={bodyText}
              border={cardBorder}
            >
              <HStack spacing={3}>
                <Circle size="42px" bg="rgba(16,185,129,0.12)" color="green.500">
                  <Icon as={MdOutlinePlayCircle} boxSize="20px" />
                </Circle>
                <Heading size="md" fontWeight="extrabold">
                  {t("homePro.how.student.title")}
                </Heading>
              </HStack>

              {studentSteps.map((step, index) => (
                <HStack key={step} align="start" spacing={3}>
                  <Circle size="28px" bg="rgba(16,185,129,0.10)" color="green.500" fontSize="sm" fontWeight="800" flexShrink={0}>
                    {index + 1}
                  </Circle>
                  <Text color={subText}>{stripStepPrefix(step)}</Text>
                </HStack>
              ))}

              <Divider />

              <Text fontWeight="bold" color={bodyText}>
                {t("homePro.how.student.benefitTitle")}
              </Text>
              <List spacing={2} color={subText}>
                {studentBenefits.map((benefit) => (
                  <ListItem key={benefit}>
                    <ListIcon as={CheckCircleIcon} color="green.400" />
                    {benefit}
                  </ListItem>
                ))}
              </List>
            </VStack>
          </SimpleGrid>
        </Container>
      </Box>

      {/* ================= 5) PROMESSE + ARGUMENTS PSYCHO ================= */}
      <Box py={{ base: 16, md: 20 }} px={4} bg={bgSection}>
        <Container maxW="container.xl">
          <VStack spacing={3} textAlign="center" mb={10}>
            <Text color="blue.500" fontWeight="800" letterSpacing="0.08em" textTransform="uppercase" fontSize="xs">
              Pourquoi ça convainc
            </Text>
            <Heading fontSize={{ base: "2xl", md: "3xl" }} color={bodyText} fontWeight="extrabold">
              {t("homePro.promise.title")}
            </Heading>
            <Text maxW="980px" color={subText} fontSize={{ base: "md", md: "lg" }}>
              {t("homePro.promise.subtitle")}
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mb={10}>
            <SalesCard icon={MdOutlineAutoAwesome} accent="blue.500" title={t("homePro.promise.cards.simplicity.title")} desc={t("homePro.promise.cards.simplicity.desc")} />
            <SalesCard icon={MdOutlineTimer} accent="orange.500" title={t("homePro.promise.cards.speed.title")} desc={t("homePro.promise.cards.speed.desc")} />
            <SalesCard icon={MdOutlineInsights} accent="purple.500" title={t("homePro.promise.cards.centralized.title")} desc={t("homePro.promise.cards.centralized.desc")} />
          </SimpleGrid>

          <Box
            maxW="1120px"
            mx="auto"
            bg={promiseSurface}
            border={promiseBorder}
            borderRadius="32px"
            p={{ base: 6, md: 8 }}
            boxShadow="0 24px 80px rgba(15,23,42,0.28)"
          >
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8} alignItems="start">
              <Box>
                <Heading mt={1} size="lg" color="white" fontWeight="extrabold">
                  {t("homePro.promise.ctaBlock.title")}
                </Heading>
                <Text mt={3} color="whiteAlpha.800" lineHeight="1.75">
                  {t("homePro.promise.ctaBlock.desc")}
                </Text>

                <Button mt={5} size="lg" onClick={startTrialNow} {...ctaButtonProps}>
                  {t("homePro.promise.ctaBlock.cta")}
                </Button>

                <Text mt={2} fontSize="sm" color="whiteAlpha.700">
                  {t("homePro.promise.ctaBlock.hint")}
                </Text>
              </Box>

              <Box bg="rgba(255,255,255,0.08)" border="1px solid rgba(255,255,255,0.12)" borderRadius="24px" p={{ base: 5, md: 6 }}>
                <Heading size="sm" color="white" fontWeight="extrabold" mb={3}>
                  {t("homePro.promise.forYouTitle")}
                </Heading>

                <List spacing={2.5} color="whiteAlpha.800">
                  {[
                    t("homePro.promise.forYou.f1"),
                    t("homePro.promise.forYou.f2"),
                    t("homePro.promise.forYou.f3"),
                    t("homePro.promise.forYou.f4"),
                    t("homePro.promise.forYou.f5"),
                  ].map((item) => (
                    <ListItem key={item}>
                      <ListIcon as={CheckCircleIcon} color="blue.200" />
                      {item}
                    </ListItem>
                  ))}
                </List>
              </Box>
            </SimpleGrid>
          </Box>
        </Container>
      </Box>

      {/* ================= FAQ ================= */}
      <Box py={{ base: 16, md: 20 }} px={4} bg={bgSoft}>
        <Container maxW="container.md">
          <VStack spacing={3} textAlign="center" mb={8}>
            <Text color="blue.500" fontWeight="800" letterSpacing="0.08em" textTransform="uppercase" fontSize="xs">
              Réponses utiles
            </Text>
            <Heading textAlign="center" fontSize={{ base: "2xl", md: "3xl" }} color={bodyText} fontWeight="extrabold">
              {t("homePro.faq.title")}
            </Heading>
          </VStack>

          <Accordion allowToggle bg={accordionBg} border={cardBorder} borderRadius="28px" boxShadow={cardShadow}>
            {faqKeys.map((k) => (
              <AccordionItem key={k} border="none">
                <AccordionButton px={6} py={5} _hover={{ bg: accordionHover }}>
                  <Box flex="1" textAlign="left" fontWeight="bold" color={bodyText}>
                    {t(`homePro.faq.items.${k}.q`)}
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel px={6} pb={6} color={subText}>
                  {t(`homePro.faq.items.${k}.a`)}
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>

          <Box
            mt={10}
            bg={surfaceStrong}
            border={sectionBorder}
            boxShadow={sectionShadow}
            borderRadius="28px"
            p={{ base: 6, md: 7 }}
            textAlign="center"
          >
            <Heading size="md" color={bodyText} fontWeight="extrabold">
              Prêt à voir si l’outil vous fait gagner du temps ?
            </Heading>
            <Text mt={2} color={subText}>
              Testez l’espace pro dans de bonnes conditions et jugez par vous-même sur vos vrais usages.
            </Text>
            <Button mt={5} size="lg" onClick={startTrialNow} {...ctaButtonProps}>
              {t("homePro.faq.cta")}
            </Button>
            <Text mt={2} fontSize="sm" color={subText}>
              {t("homePro.faq.hint")}
            </Text>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
