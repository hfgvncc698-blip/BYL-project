 
import { Badge, Box, HStack, SimpleGrid, Text, useColorModeValue } from "@chakra-ui/react";
import i18n from "../../i18n/index";

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
}) {
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step.key === activeStep));
  const containerBg = useColorModeValue(
    "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(239,246,255,0.92) 54%, rgba(236,253,245,0.82))",
    "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(11,16,27,0.92) 54%, rgba(15,38,44,0.84))"
  );
  const containerColor = useColorModeValue("#0F172A", "white");
  const containerBorder = useColorModeValue("rgba(148, 163, 184, 0.28)", "rgba(255,255,255,0.10)");
  const containerShadow = useColorModeValue("0 14px 34px rgba(15, 23, 42, 0.08)", "0 18px 44px rgba(0,0,0,0.30)");
  const eyebrowColor = useColorModeValue("#64748B", "rgba(255,255,255,0.58)");
  const badgeBg = useColorModeValue("#E0F2FE", "rgba(14,165,233,0.16)");
  const badgeColor = useColorModeValue("#0F4C81", "#BAE6FD");
  const activeBg = useColorModeValue("#0F172A", "rgba(255,255,255,0.94)");
  const activeColor = useColorModeValue("white", "#0F172A");
  const activeBorder = useColorModeValue("#0F172A", "rgba(255,255,255,0.92)");
  const doneBg = useColorModeValue("rgba(204, 251, 241, 0.72)", "rgba(20,184,166,0.18)");
  const doneBorder = useColorModeValue("#5EEAD4", "rgba(94,234,212,0.48)");
  const idleBg = useColorModeValue("rgba(255, 255, 255, 0.72)", "rgba(255,255,255,0.055)");
  const idleBorder = useColorModeValue("rgba(148, 163, 184, 0.35)", "rgba(255,255,255,0.10)");
  const idleText = useColorModeValue("#0F172A", "rgba(255,255,255,0.82)");
  const helperText = useColorModeValue("#64748B", "rgba(255,255,255,0.56)");
  const activeHelperText = useColorModeValue("whiteAlpha.800", "blackAlpha.700");
  const doneDotBg = useColorModeValue("#14B8A6", "#5EEAD4");
  const idleDotBg = useColorModeValue("#E2E8F0", "rgba(255,255,255,0.10)");
  const idleDotColor = useColorModeValue("#475569", "rgba(255,255,255,0.62)");
  const hoverBorder = useColorModeValue("#0EA5E9", "#38BDF8");

  return (
    <Box
      bg={containerBg}
      color={containerColor}
      borderWidth="1px"
      borderColor={containerBorder}
      borderRadius="lg"
      p={{ base: 2, md: 4 }}
      boxShadow={containerShadow}
    >
      <HStack justify="space-between" align="center" gap={2} mb={{ base: 1.5, md: 3 }} flexWrap="nowrap">
        <Box>
          <Text fontSize={{ base: "10px", md: "xs" }} fontWeight="900" letterSpacing={{ base: "0.08em", md: "0.12em" }} color={eyebrowColor}>
            {i18n.t("auto.NutritionWorkflowBar.parcours_nutrition", "PARCOURS NUTRITION")}
          </Text>
          <Text display={{ base: "none", md: "block" }} fontWeight="900" fontSize="lg" lineHeight="1.1">
            {i18n.t("auto.NutritionWorkflowBar.fil_conducteur", "Fil conducteur du suivi")}
          </Text>
        </Box>
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
              as={canNavigate ? "button" : "div"}
              type={canNavigate ? "button" : undefined}
              flex="0 0 auto"
              minW={isActive ? "112px" : "74px"}
              maxW={isActive ? "128px" : "82px"}
              textAlign="left"
              borderWidth="1px"
              borderColor={isActive ? activeBorder : isDone ? doneBorder : idleBorder}
              borderRadius="md"
              bg={isActive ? activeBg : isDone ? doneBg : idleBg}
              color={isActive ? activeColor : idleText}
              px={2}
              py={1.5}
              cursor={canNavigate ? "pointer" : "default"}
              transition="all 0.18s ease"
              onClick={() => {
                if (canNavigate && clientId && assessmentId && navigate) navigate(target);
              }}
              _hover={canNavigate ? { borderColor: isActive ? activeBorder : hoverBorder } : undefined}
            >
              <HStack spacing={1.5} align="center">
                <Box
                  flexShrink={0}
                  w="24px"
                  h="24px"
                  borderRadius="full"
                  display="grid"
                  placeItems="center"
                  bg={isActive ? activeColor : isDone ? doneDotBg : idleDotBg}
                  color={isActive ? activeBg : isDone ? "#0F172A" : idleDotColor}
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
              as={canNavigate ? "button" : "div"}
              type={canNavigate ? "button" : undefined}
              textAlign="left"
              borderWidth="1px"
              borderColor={isActive ? activeBorder : isDone ? doneBorder : idleBorder}
              borderRadius="md"
              bg={isActive ? activeBg : isDone ? doneBg : idleBg}
              color={isActive ? activeColor : idleText}
              p={3}
              cursor={canNavigate ? "pointer" : "default"}
              transition="all 0.18s ease"
              onClick={() => {
                if (canNavigate && clientId && assessmentId && navigate) navigate(target);
              }}
              _hover={canNavigate ? { transform: "translateY(-1px)", borderColor: isActive ? activeBorder : hoverBorder } : undefined}
            >
              <HStack spacing={3} align="start">
                <Box
                  flexShrink={0}
                  w="32px"
                  h="32px"
                  borderRadius="full"
                  display="grid"
                  placeItems="center"
                  bg={isActive ? activeColor : isDone ? doneDotBg : idleDotBg}
                  color={isActive ? activeBg : isDone ? "#0F172A" : idleDotColor}
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
