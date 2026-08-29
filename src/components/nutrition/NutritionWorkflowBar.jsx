 
import { ArrowBackIcon } from "@chakra-ui/icons";
import { Badge, Box, HStack, IconButton, SimpleGrid, Text, useColorModeValue } from "@chakra-ui/react";
import i18n from "../../i18n/index";
import { useNutritionTheme } from "../../styles/nutritionTheme";

const STEPS = [
  {
    key: "bilan",
    index: "01",
    labelKey: "auto.NutritionWorkflowBar.bilan",
    labelDefault: "Bilan",
    helperKey: "auto.NutritionWorkflowBar.bilan_helper",
    helperDefault: "Identité, objectifs, mesures",
    path: (clientId, assessmentId) => `/clients/${clientId}/nutrition/${assessmentId}`,
  },
  {
    key: "habitudes",
    index: "02",
    labelKey: "auto.NutritionWorkflowBar.habitudes",
    labelDefault: "Habitudes",
    helperKey: "auto.NutritionWorkflowBar.habitudes_helper",
    helperDefault: "Ration spontanée",
    path: (clientId, assessmentId) => `/clients/${clientId}/nutrition/${assessmentId}/food-survey`,
  },
  {
    key: "ration",
    index: "03",
    labelKey: "auto.NutritionWorkflowBar.ration",
    labelDefault: "Ration",
    helperKey: "auto.NutritionWorkflowBar.ration_helper",
    helperDefault: "Cibles et portions",
    path: (clientId, assessmentId) => `/clients/${clientId}/nutrition/${assessmentId}/ration`,
  },
  {
    key: "menu",
    index: "04",
    labelKey: "auto.NutritionWorkflowBar.menu",
    labelDefault: "Menu",
    helperKey: "auto.NutritionWorkflowBar.menu_helper",
    helperDefault: "Menus, recettes, partage",
    path: (clientId, assessmentId) => `/clients/${clientId}/nutrition/${assessmentId}/menu`,
  },
];

export default function NutritionWorkflowBar({
  activeStep,
  clientId,
  assessmentId,
  navigate,
  canNavigate = true,
  onBack,
}) {
  const navigationEnabled = Boolean(canNavigate && clientId && assessmentId);
  const handleStepClick = (event, target) => {
    if (!navigationEnabled || !navigate) return;

    event.preventDefault();
    try {
      navigate(target);
    } catch {
      window.location.assign(target);
    }
  };
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step.key === activeStep));
  const theme = useNutritionTheme();
  const containerBg = theme.surfaceBgStrong;
  const containerColor = useColorModeValue("#0F172A", "white");
  const containerBorder = theme.borderStrong;
  const containerShadow = useColorModeValue("0 18px 50px rgba(15,23,42,0.07)", "0 20px 54px rgba(0,0,0,0.28)");
  const eyebrowColor = theme.mutedText;
  const badgeBg = useColorModeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.15)");
  const badgeColor = useColorModeValue("#2563EB", "#93C5FD");
  const activeBg = useColorModeValue("rgba(59,130,246,0.10)", "rgba(59,130,246,0.14)");
  const activeColor = theme.textColor;
  const activeBorder = useColorModeValue("#3B82F6", "#60A5FA");
  const doneBg = theme.surfaceSoft;
  const doneBorder = useColorModeValue("rgba(59,130,246,0.28)", "rgba(96,165,250,0.30)");
  const idleBg = theme.surfaceSoft;
  const idleBorder = theme.borderColor;
  const idleText = useColorModeValue("#0F172A", "rgba(255,255,255,0.82)");
  const helperText = theme.mutedText;
  const activeHelperText = theme.mutedText;
  const doneDotBg = useColorModeValue("#DBEAFE", "rgba(59,130,246,0.22)");
  const idleDotBg = useColorModeValue("#E2E8F0", "rgba(255,255,255,0.08)");
  const idleDotColor = useColorModeValue("#475569", "rgba(255,255,255,0.62)");
  const hoverBorder = useColorModeValue("#0EA5E9", "#38BDF8");

  return (
    <Box
      bg={containerBg}
      color={containerColor}
      borderWidth="1px"
      borderColor={containerBorder}
      borderRadius="22px"
      p={{ base: 3, md: 4 }}
      boxShadow={containerShadow}
    >
      <HStack justify="space-between" align="center" gap={2} mb={{ base: 1.5, md: 3 }} flexWrap="nowrap">
        <HStack spacing={{ base: 2, md: 3 }} minW={0}>
          {onBack ? (
            <IconButton
              aria-label={i18n.t("programView.back", "Retour")}
              icon={<ArrowBackIcon boxSize={{ base: 4, md: 5 }} />}
              onClick={onBack}
              variant="outline"
              borderRadius="full"
              size={{ base: "sm", md: "md" }}
              w={{ base: "36px", md: "44px" }}
              h={{ base: "36px", md: "44px" }}
              minW={{ base: "36px", md: "44px" }}
              p={0}
              aspectRatio="1"
              flexShrink={0}
            />
          ) : null}
          <Box minW={0}>
            <Text fontSize={{ base: "10px", md: "xs" }} fontWeight="900" letterSpacing={{ base: "0.08em", md: "0.12em" }} color={eyebrowColor}>
              {i18n.t("auto.NutritionWorkflowBar.parcours_nutrition", "PARCOURS NUTRITION")}
            </Text>
            <Text display={{ base: "none", md: "block" }} fontWeight="900" fontSize="lg" lineHeight="1.1">
              {i18n.t("auto.NutritionWorkflowBar.fil_conducteur", "Fil conducteur du suivi")}
            </Text>
          </Box>
        </HStack>
        <Badge bg={badgeBg} color={badgeColor} borderRadius="full" px={{ base: 2, md: 3 }} py={{ base: 0.5, md: 1 }} flexShrink={0} fontSize={{ base: "10px", md: "xs" }}>
          {i18n.t("auto.NutritionWorkflowBar.etape_value", "Étape {{current}}/{{total}}", {
            current: activeIndex + 1,
            total: STEPS.length,
          })}
        </Badge>
      </HStack>

      <HStack
        display={{ base: "flex", md: "none" }}
        spacing={1.5}
        overflowX="auto"
        overflowY="hidden"
        pb={1}
        mx={-0.5}
        px={0.5}
        sx={{
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {STEPS.map((step, index) => {
          const isActive = step.key === activeStep;
          const isDone = index < activeIndex;
          const target = step.path(clientId, assessmentId);

          return (
            <Box
              key={step.key}
              as={navigationEnabled ? "a" : "div"}
              href={navigationEnabled ? target : undefined}
              flex="0 0 auto"
              minW={isActive ? "112px" : "74px"}
              maxW={isActive ? "128px" : "82px"}
              textAlign="left"
              borderWidth="1px"
              borderColor={isActive ? activeBorder : isDone ? doneBorder : idleBorder}
              borderRadius="16px"
              bg={isActive ? activeBg : isDone ? doneBg : idleBg}
              color={isActive ? activeColor : idleText}
              px={2}
              py={1.5}
              cursor={navigationEnabled ? "pointer" : "default"}
              textDecoration="none"
              transition="all 0.18s ease"
              onClick={(event) => handleStepClick(event, target)}
              _hover={navigationEnabled ? { borderColor: isActive ? activeBorder : hoverBorder } : undefined}
              _focusVisible={{ outline: "2px solid", outlineColor: activeBorder, outlineOffset: "2px" }}
            >
              <HStack spacing={1.5} align="center">
                <Box
                  flexShrink={0}
                  w="24px"
                  h="24px"
                  borderRadius="full"
                  display="grid"
                  placeItems="center"
                  bg={isActive ? "#3B82F6" : isDone ? doneDotBg : idleDotBg}
                  color={isActive ? "white" : isDone ? activeBorder : idleDotColor}
                  fontSize="10px"
                  fontWeight="900"
                >
                  {step.index}
                </Box>
                <Box minW={0}>
                  <Text fontWeight="900" fontSize="xs" lineHeight="1.05" noOfLines={1}>
                    {i18n.t(step.labelKey, step.labelDefault)}
                  </Text>
                  {isActive ? (
                    <Text mt={0.5} fontSize="10px" lineHeight="1.1" color={activeHelperText} noOfLines={1}>
                      {i18n.t(step.helperKey, step.helperDefault)}
                    </Text>
                  ) : null}
                </Box>
              </HStack>
            </Box>
          );
        })}
      </HStack>

      <SimpleGrid display={{ base: "none", md: "grid" }} columns={{ md: 4 }} spacing={2}>
        {STEPS.map((step, index) => {
          const isActive = step.key === activeStep;
          const isDone = index < activeIndex;
          const target = step.path(clientId, assessmentId);

          return (
            <Box
              key={step.key}
              as={navigationEnabled ? "a" : "div"}
              href={navigationEnabled ? target : undefined}
              textAlign="left"
              borderWidth="1px"
              borderColor={isActive ? activeBorder : isDone ? doneBorder : idleBorder}
              borderRadius="18px"
              bg={isActive ? activeBg : isDone ? doneBg : idleBg}
              color={isActive ? activeColor : idleText}
              p={3}
              cursor={navigationEnabled ? "pointer" : "default"}
              textDecoration="none"
              transition="all 0.18s ease"
              onClick={(event) => handleStepClick(event, target)}
              _hover={navigationEnabled ? { transform: "translateY(-1px)", borderColor: isActive ? activeBorder : hoverBorder } : undefined}
              _focusVisible={{ outline: "2px solid", outlineColor: activeBorder, outlineOffset: "2px" }}
            >
              <HStack spacing={3} align="start">
                <Box
                  flexShrink={0}
                  w="32px"
                  h="32px"
                  borderRadius="full"
                  display="grid"
                  placeItems="center"
                  bg={isActive ? "#3B82F6" : isDone ? doneDotBg : idleDotBg}
                  color={isActive ? "white" : isDone ? activeBorder : idleDotColor}
                  fontSize="xs"
                  fontWeight="900"
                >
                  {step.index}
                </Box>
                <Box minW={0}>
                  <Text fontWeight="900" lineHeight="1.1">
                    {i18n.t(step.labelKey, step.labelDefault)}
                  </Text>
                  <Text mt={1} fontSize="xs" color={isActive ? activeHelperText : helperText} noOfLines={2}>
                    {i18n.t(step.helperKey, step.helperDefault)}
                  </Text>
                </Box>
              </HStack>
            </Box>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
