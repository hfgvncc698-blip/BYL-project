import React, { useEffect, useMemo, useRef, useState } from "react";
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

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildPublisherHtml() {
  const publisherApiBase = `${getApiBase().replace(/\/$/, "")}/social-publisher`;
  const bridge = `
    <base href="/" />
    <meta name="byl-social-publisher-api-base" content="${escapeHtmlAttribute(publisherApiBase)}" />
    <meta name="byl-social-publisher-admin-url" content="/admin" />
    <meta name="byl-social-publisher-page-origin" content="${escapeHtmlAttribute(window.location.origin)}" />
    <meta name="byl-social-publisher-parent-bridge" content="true" />
  `;

  return publisherHtml.replace("<head>", `<head>${bridge}`);
}

export default function AdminSocialPublisher() {
  const theme = useAppTheme();
  const iframeRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const dashboardHtml = useMemo(() => buildPublisherHtml(), []);

  useEffect(() => {
    let cancelled = false;
    getAuthHeaders({ forceRefresh: true })
      .then((headers) => {
        if (!cancelled) setIsAuthenticated(Boolean(headers.Authorization));
      })
      .catch(() => {
        if (!cancelled) setIsAuthenticated(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const allowedPath = /^\/api\/(?:campaign|publish|connections\/config|daily\/prepare|variants\/[A-Za-z0-9._~-]+\/status)$/;
    const allowedMethods = new Set(["GET", "POST", "PATCH"]);

    async function handlePublisherRequest(event) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data;
      if (!message || message.type !== "byl-social-publisher-request") return;

      const requestId = String(message.requestId || "").slice(0, 160);
      const path = String(message.path || "");
      const method = String(message.method || "GET").toUpperCase();
      if (!requestId || !allowedPath.test(path) || !allowedMethods.has(method)) {
        event.source.postMessage({
          type: "byl-social-publisher-response",
          requestId,
          status: 403,
          data: { ok: false, error: "publisher_request_forbidden" },
        }, "*");
        return;
      }

      try {
        const authHeaders = await getAuthHeaders();
        const apiPath = path.replace(/^\/api/, "");
        const response = await fetch(`${getApiBase().replace(/\/$/, "")}/social-publisher${apiPath}`, {
          method,
          headers: { "content-type": "application/json", ...authHeaders },
          credentials: "same-origin",
          body: method === "GET" ? undefined : JSON.stringify(message.body ?? {}),
        });
        const data = await response.json().catch(() => ({ ok: false, error: "invalid_api_response" }));
        if (!cancelled) {
          event.source.postMessage({
            type: "byl-social-publisher-response",
            requestId,
            status: response.status,
            data,
          }, "*");
        }
      } catch (error) {
        if (!cancelled) {
          event.source.postMessage({
            type: "byl-social-publisher-response",
            requestId,
            status: 502,
            data: { ok: false, error: error?.message || "publisher_bridge_failed" },
          }, "*");
        }
      }
    }

    window.addEventListener("message", handlePublisherRequest);
    return () => {
      cancelled = true;
      window.removeEventListener("message", handlePublisherRequest);
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

        {isAuthenticated ? (
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
              ref={iframeRef}
              title="Social Publisher BYL"
              srcDoc={dashboardHtml}
              sandbox="allow-scripts allow-forms allow-popups allow-downloads"
              referrerPolicy="no-referrer"
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
