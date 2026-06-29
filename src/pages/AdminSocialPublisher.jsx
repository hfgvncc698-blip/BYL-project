import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  HStack,
  Heading,
  Icon,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Link as RouterLink } from "react-router-dom";
import { MdArrowBack, MdOpenInNew } from "react-icons/md";
import publisherHtml from "../../ad-samples/social-publisher/index.html?raw";
import { useAppTheme } from "../styles/appTheme";
import { getApiBase } from "../utils/apiBase";
import { getAuthHeaders } from "../utils/authHeaders";

function buildPublisherHtml(authorization = "") {
  const publisherApiBase = `${getApiBase().replace(/\/$/, "")}/social-publisher`;
  const bridge = `
    <base href="/" />
    <script>
      window.SOCIAL_PUBLISHER_API_BASE = ${JSON.stringify(publisherApiBase)};
      window.SOCIAL_PUBLISHER_ADMIN_URL = "/admin";
      window.SOCIAL_PUBLISHER_AUTHORIZATION = ${JSON.stringify(authorization)};
      window.SOCIAL_PUBLISHER_PAGE_ORIGIN = ${JSON.stringify(window.location.origin)};
    </script>
  `;

  return publisherHtml.replace("<head>", `<head>${bridge}`);
}

export default function AdminSocialPublisher() {
  const theme = useAppTheme();
  const [authorization, setAuthorization] = useState("");
  const dashboardHtml = useMemo(() => buildPublisherHtml(authorization), [authorization]);

  useEffect(() => {
    let cancelled = false;
    getAuthHeaders({ forceRefresh: true })
      .then((headers) => {
        if (!cancelled) setAuthorization(headers.Authorization || "");
      })
      .catch(() => {
        if (!cancelled) setAuthorization("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)" p={{ base: 3, md: 5 }}>
      <VStack align="stretch" spacing={4} maxW="1800px" mx="auto">
        <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
          <HStack spacing={3}>
            <Button
              as={RouterLink}
              to="/admin"
              size="sm"
              variant="outline"
              leftIcon={<Icon as={MdArrowBack} />}
            >
              Admin
            </Button>
            <Box>
              <Heading size={{ base: "md", md: "lg" }}>Social Publisher</Heading>
              <Text color={theme.mutedText} fontSize="sm">
                Dashboard de création, validation et publication des contenus BYL.
              </Text>
            </Box>
          </HStack>
          <Button
            as={RouterLink}
            to="/admin/social-publisher"
            target="_blank"
            rel="noreferrer"
            size="sm"
            variant="outline"
            rightIcon={<Icon as={MdOpenInNew} />}
          >
            Ouvrir dans un onglet
          </Button>
        </HStack>

        {authorization ? (
          <Box
            borderWidth="1px"
            borderColor="blackAlpha.200"
            _dark={{ borderColor: "whiteAlpha.200" }}
            borderRadius="lg"
            overflow="hidden"
            bg="#111416"
            h={{ base: "calc(100vh - 190px)", md: "calc(100vh - 176px)" }}
            minH="620px"
          >
            <Box
              as="iframe"
              title="Social Publisher BYL"
              srcDoc={dashboardHtml}
              w="100%"
              h="100%"
              border="0"
              display="block"
              allow="autoplay; fullscreen"
            />
          </Box>
        ) : (
          <HStack
            justify="center"
            borderWidth="1px"
            borderColor="blackAlpha.200"
            _dark={{ borderColor: "whiteAlpha.200" }}
            borderRadius="lg"
            minH="420px"
          >
            <Spinner />
            <Text color={theme.mutedText}>Connexion au dashboard social...</Text>
          </HStack>
        )}
      </VStack>
    </Box>
  );
}
