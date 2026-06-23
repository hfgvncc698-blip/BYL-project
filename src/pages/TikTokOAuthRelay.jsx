import React from "react";
import { Box, Button, Heading, Text, VStack } from "@chakra-ui/react";

const LOCAL_CALLBACK_URL = "http://localhost:5182/oauth/tiktok/callback";

export default function TikTokOAuthRelay() {
  const [targetUrl, setTargetUrl] = React.useState(LOCAL_CALLBACK_URL);

  React.useEffect(() => {
    const query = window.location.search || "";
    const hash = window.location.hash || "";
    const nextUrl = `${LOCAL_CALLBACK_URL}${query}${hash}`;

    setTargetUrl(nextUrl);

    const timer = window.setTimeout(() => {
      window.location.replace(nextUrl);
    }, 350);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <Box
      minH="100vh"
      display="grid"
      placeItems="center"
      bg="#0f1214"
      color="white"
      px={6}
    >
      <VStack spacing={5} maxW="520px" textAlign="center">
        <Heading size="lg">Connexion TikTok en cours</Heading>
        <Text color="whiteAlpha.800">
          Retour vers le tableau de bord local pour finaliser la connexion.
        </Text>
        <Button as="a" href={targetUrl} colorScheme="blue">
          Continuer vers le dashboard
        </Button>
      </VStack>
    </Box>
  );
}
