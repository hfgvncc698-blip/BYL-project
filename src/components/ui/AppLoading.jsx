import { Flex, Spinner, Text, VStack, useColorModeValue } from "@chakra-ui/react";

export default function AppLoading({
  label = "Chargement...",
  minH = "calc(100vh - 72px)",
  withPanel = true,
  size = "lg",
}) {
  const panelBg = useColorModeValue(
    [
      "radial-gradient(circle at 82% 12%, rgba(59,130,246,0.14), transparent 30%)",
      "radial-gradient(circle at 12% 100%, rgba(16,185,129,0.10), transparent 32%)",
      "rgba(255,255,255,0.82)",
    ].join(", "),
    [
      "radial-gradient(circle at 82% 12%, rgba(59,130,246,0.18), transparent 32%)",
      "radial-gradient(circle at 12% 100%, rgba(16,185,129,0.14), transparent 34%)",
      "rgba(15,23,42,0.82)",
    ].join(", ")
  );
  const borderColor = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)");
  const textColor = useColorModeValue("rgba(17,24,39,0.66)", "rgba(248,250,252,0.66)");
  const spinnerColor = useColorModeValue("#111827", "rgba(255,255,255,0.82)");
  const shadow = useColorModeValue(
    "0 24px 70px rgba(15,23,42,0.10)",
    "0 24px 70px rgba(0,0,0,0.34)"
  );

  const content = (
    <VStack
      spacing={4}
      px={withPanel ? 8 : 0}
      py={withPanel ? 7 : 0}
      bg={withPanel ? panelBg : "transparent"}
      border={withPanel ? "1px solid" : "0"}
      borderColor={borderColor}
      borderRadius="28px"
      boxShadow={withPanel ? shadow : "none"}
      backdropFilter={withPanel ? "blur(18px)" : "none"}
      minW={withPanel ? { base: "min(88vw, 320px)", md: "340px" } : "auto"}
    >
      <Spinner size={size} thickness="3px" speed="0.75s" color={spinnerColor} />
      {label ? (
        <Text color={textColor} fontWeight="800" letterSpacing="-0.01em">
          {label}
        </Text>
      ) : null}
    </VStack>
  );

  return (
    <Flex minH={minH} align="center" justify="center" px={4}>
      {content}
    </Flex>
  );
}
