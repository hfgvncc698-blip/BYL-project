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
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircleIcon } from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

const MotionVStack = motion(VStack);

// Images locales (public/)
const HERO_URL = "/hero-bg.png";
const MOCKUP_URL = "/Mockup.png";

function FeatureCard({ title, desc }) {
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
      borderRadius="2xl"
      p={{ base: 6, md: 7 }}
      transition="all 0.15s"
      _hover={{
        transform: "translateY(-2px)",
        boxShadow: "0 16px 48px rgba(20,40,80,0.18)",
      }}
    >
      <Heading size="sm" color={bodyText} mb={2} fontWeight="extrabold">
        {title}
      </Heading>
      <Text color={subText} lineHeight="1.7">
        {desc}
      </Text>
    </Box>
  );
}

function SalesCard({ title, desc }) {
  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("1px solid #E5E7EB", "1px solid #2D3748");
  const cardShadow = useColorModeValue(
    "0 12px 44px rgba(20,40,80,0.14)",
    "0 12px 44px rgba(0,0,0,0.45)"
  );
  const bodyText = useColorModeValue("gray.900", "gray.100");
  const subText = useColorModeValue("gray.600", "gray.300");

  return (
    <Box bg={cardBg} border={cardBorder} boxShadow={cardShadow} borderRadius="2xl" p={{ base: 6, md: 7 }}>
      <Heading size="sm" color={bodyText} mb={2} fontWeight="extrabold">
        {title}
      </Heading>
      <Text color={subText} lineHeight="1.7">
        {desc}
      </Text>
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

  const bodyText = useColorModeValue("gray.900", "gray.100");
  const subText = useColorModeValue("gray.600", "gray.300");
  const mutedText = useColorModeValue("gray.200", "gray.400");

  const btnBlue = useColorModeValue("blue.600", "blue.300");
  const btnBlueHover = useColorModeValue("blue.700", "blue.200");

  const cardBg = useColorModeValue("white", "gray.800");
  const cardBorder = useColorModeValue("1px solid #E5E7EB", "1px solid #2D3748");
  const cardShadow = useColorModeValue(
    "0 10px 40px rgba(20,40,80,0.12)",
    "0 12px 40px rgba(0,0,0,0.45)"
  );

  // ✅ Style “CTA long” : texte toujours visible sur mobile
  const ctaButtonProps = {
    borderRadius: "xl",
    bg: btnBlue,
    color: "white",
    fontWeight: "extrabold",
    _hover: { bg: btnBlueHover, transform: "translateY(-1px)" },
    transition: "all 0.15s",
    w: { base: "100%", md: "auto" },
    h: "auto",
    py: { base: 5, md: 4 },          // + de hauteur sur mobile
    px: { base: 6, md: 10 },         // padding horizontal
    whiteSpace: "normal",            // wrap
    textAlign: "center",
    lineHeight: "1.15",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    fontSize: { base: "md", md: "lg" }, // évite “coupé” sur petits écrans
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
            spacing={{ base: 8, md: 10 }}
            align="center"
            textAlign="center"
            py={{ base: 20, md: 30 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <Heading
              as="h1"
              lineHeight="1.02"
              fontWeight="extrabold"
              color="white"
              fontSize={{ base: "3.0rem", md: "5.2rem" }}
              letterSpacing="-0.03em"
            >
              {t("homePro.hero.titleLine1")}
              <br />
              {t("homePro.hero.titleLine2")}
            </Heading>

            <Box h={{ base: 3, md: 4 }} />

            <Text
              maxW="980px"
              color="whiteAlpha.900"
              fontSize={{ base: "lg", md: "2xl" }}
              lineHeight={{ base: "1.55", md: "1.62" }}
              fontWeight="medium"
            >
              {t("homePro.hero.subtitle")}
            </Text>

            {/* ✅ CTA principal (MOBILE) placé AVANT la bannière */}
            <VStack spacing={3} w="full" maxW="640px" mt={2} display={{ base: "flex", md: "none" }}>
              <Button size="lg" onClick={startTrialNow} {...ctaButtonProps}>
                {t("homePro.hero.cta")}
              </Button>

              <Text fontSize="sm" color={mutedText}>
                {t("homePro.hero.hint")}
              </Text>

              <Text
                fontSize="sm"
                color="blue.200"
                cursor="pointer"
                _hover={{ textDecoration: "underline", color: "blue.100" }}
                onClick={() => scrollToId("pro")}
              >
                {t("homePro.hero.scroll")}
              </Text>
            </VStack>

            {/* 3 preuves rapides */}
            <Box
              w="full"
              maxW="1080px"
              bg="whiteAlpha.160"
              border="1px solid rgba(255,255,255,0.18)"
              borderRadius="2xl"
              px={{ base: 5, md: 10 }}
              py={{ base: 6, md: 7 }}
              mt={{ base: 2, md: 3 }}
            >
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 5, md: 7 }} textAlign="left">
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

            {/* ✅ CTA principal (DESKTOP) reste à l'endroit actuel */}
            <VStack spacing={3} w="full" maxW="640px" mt={2} display={{ base: "none", md: "flex" }}>
              <Button size="lg" onClick={startTrialNow} {...ctaButtonProps}>
                {t("homePro.hero.cta")}
              </Button>

              <Text fontSize="sm" color={mutedText}>
                {t("homePro.hero.hint")}
              </Text>

              <Text
                fontSize="sm"
                color="blue.200"
                cursor="pointer"
                _hover={{ textDecoration: "underline", color: "blue.100" }}
                onClick={() => scrollToId("pro")}
              >
                {t("homePro.hero.scroll")}
              </Text>
            </VStack>
          </MotionVStack>
        </Container>
      </Box>

      {/* ================= 2) CE QUE VOUS OBTENEZ ================= */}
      <Box id="pro" py={16} px={4} bg={bgSoft}>
        <Container maxW="container.xl">
          <VStack spacing={3} textAlign="center" mb={10}>
            <Heading fontSize="2xl" color={bodyText} fontWeight="extrabold">
              {t("homePro.benefits.title")}
            </Heading>
            <Text maxW="960px" color={subText} fontSize={{ base: "md", md: "lg" }}>
              {t("homePro.benefits.subtitle")}
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} maxW="1100px" mx="auto">
            <FeatureCard title={t("homePro.benefits.cards.c1.title")} desc={t("homePro.benefits.cards.c1.desc")} />
            <FeatureCard title={t("homePro.benefits.cards.c2.title")} desc={t("homePro.benefits.cards.c2.desc")} />
            <FeatureCard title={t("homePro.benefits.cards.c3.title")} desc={t("homePro.benefits.cards.c3.desc")} />
            <FeatureCard title={t("homePro.benefits.cards.c4.title")} desc={t("homePro.benefits.cards.c4.desc")} />
          </SimpleGrid>

          <Box mt={10} textAlign="center">
            <Button size="lg" onClick={startTrialNow} {...ctaButtonProps}>
              {t("homePro.benefits.cta")}
            </Button>
            <Text mt={2} fontSize="sm" color={subText}>
              {t("homePro.benefits.hint")}
            </Text>
          </Box>
        </Container>
      </Box>

      {/* ================= 3) APERÇU PRODUIT (MOCKUP) ================= */}
      <Box id="mockup" py={{ base: 12, md: 18 }} px={4} bg={bgSection}>
        <Container maxW="container.xl">
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 10, lg: 12 }} alignItems="center">
            <VStack align="start" spacing={5}>
              <Heading fontSize={{ base: "2xl", md: "3xl" }} color={bodyText} fontWeight="extrabold">
                {t("homePro.mockup.title")}
              </Heading>

              <Text color={subText} fontSize={{ base: "md", md: "lg" }} lineHeight="1.75">
                {t("homePro.mockup.p1")}
              </Text>

              <Text color={subText} fontSize={{ base: "md", md: "lg" }} lineHeight="1.75">
                {t("homePro.mockup.p2")}
              </Text>

              <Button size="md" onClick={startTrialNow} {...ctaButtonProps}>
                {t("homePro.mockup.cta")}
              </Button>

              <Text fontSize="sm" color={subText}>
                {t("homePro.mockup.hint")}
              </Text>
            </VStack>

            <Box
              mx="auto"
              w="full"
              maxW={{ base: "620px", lg: "860px" }}
              borderRadius={{ base: "xl", md: "2xl" }}
              overflow="hidden"
              border={useColorModeValue("1px solid #E5E7EB", "1px solid rgba(255,255,255,0.12)")}
              boxShadow={useColorModeValue("0 24px 70px rgba(0,0,0,0.20)", "0 24px 70px rgba(0,0,0,0.55)")}
            >
              <Box as="img" src={MOCKUP_URL} alt={t("homePro.mockup.imageAlt")} w="100%" h="auto" display="block" />
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      {/* ================= 4) COMMENT ÇA MARCHE ================= */}
      <Box py={16} px={4} bg={bgSoft}>
        <Container maxW="container.xl">
          <Heading textAlign="center" mb={8} fontSize="2xl" color={bodyText} fontWeight="extrabold">
            {t("homePro.how.title")}
          </Heading>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8}>
            <VStack
              align="start"
              bg={cardBg}
              boxShadow={cardShadow}
              borderRadius="2xl"
              p={8}
              spacing={4}
              color={bodyText}
              border={cardBorder}
              minH="360px"
            >
              <Heading size="md" fontWeight="extrabold">
                {t("homePro.how.coach.title")}
              </Heading>

              <Text color={subText}>{t("homePro.how.coach.steps.s1")}</Text>
              <Text color={subText}>{t("homePro.how.coach.steps.s2")}</Text>
              <Text color={subText}>{t("homePro.how.coach.steps.s3")}</Text>

              <Divider />

              <Text fontWeight="bold" color={bodyText}>
                {t("homePro.how.coach.gainTitle")}
              </Text>
              <List spacing={2} color={subText}>
                <ListItem>
                  <ListIcon as={CheckCircleIcon} color="blue.400" />
                  {t("homePro.how.coach.gains.g1")}
                </ListItem>
                <ListItem>
                  <ListIcon as={CheckCircleIcon} color="blue.400" />
                  {t("homePro.how.coach.gains.g2")}
                </ListItem>
                <ListItem>
                  <ListIcon as={CheckCircleIcon} color="blue.400" />
                  {t("homePro.how.coach.gains.g3")}
                </ListItem>
              </List>
            </VStack>

            <VStack
              align="start"
              bg={cardBg}
              boxShadow={cardShadow}
              borderRadius="2xl"
              p={8}
              spacing={4}
              color={bodyText}
              border={cardBorder}
              minH="360px"
            >
              <Heading size="md" fontWeight="extrabold">
                {t("homePro.how.student.title")}
              </Heading>

              <Text color={subText}>{t("homePro.how.student.steps.s1")}</Text>
              <Text color={subText}>{t("homePro.how.student.steps.s2")}</Text>
              <Text color={subText}>{t("homePro.how.student.steps.s3")}</Text>

              <Divider />

              <Text fontWeight="bold" color={bodyText}>
                {t("homePro.how.student.benefitTitle")}
              </Text>
              <List spacing={2} color={subText}>
                <ListItem>
                  <ListIcon as={CheckCircleIcon} color="blue.400" />
                  {t("homePro.how.student.benefits.b1")}
                </ListItem>
                <ListItem>
                  <ListIcon as={CheckCircleIcon} color="blue.400" />
                  {t("homePro.how.student.benefits.b2")}
                </ListItem>
                <ListItem>
                  <ListIcon as={CheckCircleIcon} color="blue.400" />
                  {t("homePro.how.student.benefits.b3")}
                </ListItem>
              </List>
            </VStack>
          </SimpleGrid>
        </Container>
      </Box>

      {/* ================= 5) PROMESSE + ARGUMENTS PSYCHO ================= */}
      <Box py={16} px={4} bg={bgSection}>
        <Container maxW="container.xl">
          <VStack spacing={3} textAlign="center" mb={10}>
            <Heading fontSize="2xl" color={bodyText} fontWeight="extrabold">
              {t("homePro.promise.title")}
            </Heading>
            <Text maxW="980px" color={subText} fontSize={{ base: "md", md: "lg" }}>
              {t("homePro.promise.subtitle")}
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} mb={10}>
            <SalesCard title={t("homePro.promise.cards.simplicity.title")} desc={t("homePro.promise.cards.simplicity.desc")} />
            <SalesCard title={t("homePro.promise.cards.speed.title")} desc={t("homePro.promise.cards.speed.desc")} />
            <SalesCard title={t("homePro.promise.cards.centralized.title")} desc={t("homePro.promise.cards.centralized.desc")} />
          </SimpleGrid>

          <Box
            maxW="1100px"
            mx="auto"
            bg={useColorModeValue("white", "gray.900")}
            border={useColorModeValue("2px solid rgba(49,130,206,0.22)", "2px solid rgba(99,179,237,0.20)")}
            borderRadius="2xl"
            p={{ base: 6, md: 8 }}
            boxShadow={useColorModeValue("0 16px 60px rgba(20,40,80,0.18)", "0 16px 60px rgba(0,0,0,0.55)")}
          >
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8} alignItems="start">
              <Box>
                <Heading mt={1} size="lg" color={bodyText} fontWeight="extrabold">
                  {t("homePro.promise.ctaBlock.title")}
                </Heading>
                <Text mt={3} color={subText} lineHeight="1.75">
                  {t("homePro.promise.ctaBlock.desc")}
                </Text>

                <Button mt={5} size="lg" onClick={startTrialNow} {...ctaButtonProps}>
                  {t("homePro.promise.ctaBlock.cta")}
                </Button>

                <Text mt={2} fontSize="sm" color={subText}>
                  {t("homePro.promise.ctaBlock.hint")}
                </Text>
              </Box>

              <Box>
                <Heading size="sm" color={bodyText} fontWeight="extrabold" mb={3}>
                  {t("homePro.promise.forYouTitle")}
                </Heading>

                <List spacing={2} color={subText}>
                  <ListItem>
                    <ListIcon as={CheckCircleIcon} color="blue.400" />
                    {t("homePro.promise.forYou.f1")}
                  </ListItem>
                  <ListItem>
                    <ListIcon as={CheckCircleIcon} color="blue.400" />
                    {t("homePro.promise.forYou.f2")}
                  </ListItem>
                  <ListItem>
                    <ListIcon as={CheckCircleIcon} color="blue.400" />
                    {t("homePro.promise.forYou.f3")}
                  </ListItem>
                  <ListItem>
                    <ListIcon as={CheckCircleIcon} color="blue.400" />
                    {t("homePro.promise.forYou.f4")}
                  </ListItem>
                  <ListItem>
                    <ListIcon as={CheckCircleIcon} color="blue.400" />
                    {t("homePro.promise.forYou.f5")}
                  </ListItem>
                </List>
              </Box>
            </SimpleGrid>
          </Box>
        </Container>
      </Box>

      {/* ================= FAQ ================= */}
      <Box py={16} px={4} bg={bgSoft}>
        <Container maxW="container.md">
          <Heading textAlign="center" mb={8} fontSize="2xl" color={bodyText} fontWeight="extrabold">
            {t("homePro.faq.title")}
          </Heading>

          <Accordion allowToggle bg={cardBg} border={cardBorder} borderRadius="2xl" boxShadow={cardShadow}>
            {faqKeys.map((k) => (
              <AccordionItem key={k} border="none">
                <AccordionButton px={6} py={5}>
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

          <Box mt={10} textAlign="center">
            <Button size="lg" onClick={startTrialNow} {...ctaButtonProps}>
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

