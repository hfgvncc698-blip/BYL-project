import { useState } from "react";
import {
  Box,
  Flex,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";
import { AddIcon } from "@chakra-ui/icons";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MessagingContactList from "../components/messaging/MessagingContactList";
import MessagingThread from "../components/messaging/MessagingThread";
import useMessagingContacts from "../components/messaging/useMessagingContacts";
import PageBackButton from "../components/ui/PageBackButton";
import { AppSurface } from "../components/ui/AppPrimitives";
import { useAppTheme } from "../styles/appTheme";

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function MessagingPage() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contacts, loading, isClient } = useMessagingContacts();
  const [search, setSearch] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const selectedId = searchParams.get("conversation") || "";
  const selectedContact = contacts.find((contact) => contact.id === selectedId) || null;
  const visibleContacts = isClient || directoryOpen
    ? contacts
    : contacts.filter((contact) => contact.conversation);
  const filteredContacts = visibleContacts.filter((contact) => normalize([contact.title, contact.email].join(" ")).includes(normalize(search)));

  const selectContact = (contact) => setSearchParams({ conversation: contact.id });

  return (
    <Box
      minH="100vh"
      bg={theme.pageBg}
      color={theme.textColor}
      px={{ base: selectedContact ? 0 : 3, md: 6 }}
      py={{ base: selectedContact ? 0 : 4, md: 6 }}
      pb={{ base: selectedContact ? 0 : 28, md: 6 }}
    >
      <Box maxW="7xl" mx="auto">
        <AppSurface display={{ base: selectedContact ? "none" : "block", md: "block" }} p={{ base: 4, md: 5 }} mb={4}>
          <HStack align="flex-start" spacing={3}>
            <PageBackButton fallbackTo={isClient ? "/user-dashboard" : "/coach-dashboard"} />
            <Box>
              <Heading size="lg">{t("messaging.title")}</Heading>
              <Text mt={1} color={theme.mutedText}>
                {isClient
                  ? t("messagingRole.clientSubtitle", "Échange simplement avec les professionnels qui t’accompagnent.")
                  : t("messagingRole.professionalSubtitle", "Échange simplement avec tes clients et tes patients.")}
              </Text>
            </Box>
          </HStack>
        </AppSurface>

        <AppSurface
          p={0}
          overflow="hidden"
          borderRadius={{ base: selectedContact ? 0 : "24px", md: "24px" }}
        >
          <Flex
            h={{ base: selectedContact ? "calc(100dvh - 64px)" : "calc(100vh - 245px)", md: "650px" }}
            minH={{ base: selectedContact ? "calc(100dvh - 64px)" : "500px", md: "580px" }}
          >
            <Box
              display={{ base: selectedContact ? "none" : "block", md: "block" }}
              w={{ base: "full", md: "340px" }}
              flexShrink={0}
              borderRight={{ base: "none", md: "1px solid" }}
              borderColor={theme.borderColor}
              overflowY="auto"
              p={3}
            >
              {!isClient ? (
                <>
                  <Button
                    w="full"
                    mb={3}
                    variant={directoryOpen ? "solid" : "outline"}
                    colorScheme={directoryOpen ? "blue" : undefined}
                    borderRadius="full"
                    leftIcon={<AddIcon boxSize="10px" />}
                    onClick={() => setDirectoryOpen((value) => !value)}
                  >
                    {t("messaging.startConversation")}
                  </Button>
                  <InputGroup mb={3}>
                    <InputLeftElement pointerEvents="none"><SearchIcon color={theme.mutedText} /></InputLeftElement>
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("messaging.search")} borderRadius="full" />
                  </InputGroup>
                </>
              ) : null}
              {loading ? <Flex py={10} justify="center"><Spinner size="sm" /></Flex> : (
                <MessagingContactList contacts={filteredContacts} selectedId={selectedContact?.id} onSelect={selectContact} />
              )}
            </Box>

            <Box display={{ base: selectedContact ? "block" : "none", md: "block" }} flex="1" minW={0}>
              {selectedContact ? (
                <MessagingThread contact={selectedContact} onBack={() => setSearchParams({})} />
              ) : (
                <Flex h="full" align="center" justify="center" textAlign="center" px={6}>
                  <Box>
                    <Heading size="sm">{t("messaging.selectTitle")}</Heading>
                    <Text mt={2} color={theme.mutedText}>{t("messaging.selectBody")}</Text>
                  </Box>
                </Flex>
              )}
            </Box>
          </Flex>
        </AppSurface>
      </Box>
    </Box>
  );
}
