import React from "react";
import { Box, Button, Flex, Heading, Text, VStack } from "@chakra-ui/react";
import i18n from "../../i18n";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[AppErrorBoundary] Application rendering failed:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Flex
        minH="100vh"
        align="center"
        justify="center"
        px={4}
        bgGradient="radial(circle at 82% 12%, blue.100, transparent 34%)"
      >
        <Box
          width="min(92vw, 520px)"
          p={{ base: 6, md: 8 }}
          border="1px solid"
          borderColor="blackAlpha.200"
          borderRadius="28px"
          bg="chakra-body-bg"
          boxShadow="0 24px 70px rgba(15, 23, 42, 0.14)"
        >
          <VStack spacing={4} align="stretch">
            <Heading size="md">
              {i18n.t("common.page_temporarily_unavailable", "Cette page a rencontré un problème")}
            </Heading>
            <Text color="gray.500">
              {i18n.t(
                "common.page_error_recovery",
                "Tes données sont conservées. Recharge la page pour reprendre normalement."
              )}
            </Text>
            <Button colorScheme="blue" size="lg" onClick={this.handleReload}>
              {i18n.t("common.reload_page", "Recharger la page")}
            </Button>
          </VStack>
        </Box>
      </Flex>
    );
  }
}
