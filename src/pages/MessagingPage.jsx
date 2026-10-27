import { useAuth } from "../AuthContext";
import PlanInclusionBadge from "../components/PlanInclusionBadge";
import { canUseIntegratedMessaging } from "../utils/proPlanAccess";
import useMemberClubContacts from '../components/messaging/useMemberClubContacts';
import { clubText } from '../i18n/clubText';
import ClubMessagingPanel, { ClubThread } from '../components/messaging/ClubMessagingPanel';
import { useState } from "react";
import {
  Box,
  Flex,
  Heading,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  IconButton,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { SearchIcon } from "@chakra-ui/icons";
import { AddIcon } from "@chakra-ui/icons";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MessagingContactList from "../components/messaging/MessagingContactList";
import MessagingThread from "../components/messaging/MessagingThread";
import useMessagingContacts from "../components/messaging/useMessagingContacts";
import PageBackButton from "../components/ui/PageBackButton";
import { AppSurface } from "../components/ui/AppPrimitives";
import { useAppTheme } from "../styles/appTheme";

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function MessagingPage() {
  const [params] = useSearchParams();
  return params.get('mode') === 'club' ? <ClubMessagingPanel /> : <ProfessionalMessagingPage />;
}
function ProfessionalMessagingPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const packRequest = location.state?.packRequest;
  const suggestedMessage = location.state?.suggestedMessage;
  const clearPackRequest = () => navigate(location.pathname + location.search, {replace:true, state:{...location.state, packRequest:null, suggestedMessage:null}});

  const { t } = useTranslation();
  const { contacts: clubContacts, error: clubError } = useMemberClubContacts();
  const theme = useAppTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const { contacts, loading, isClient, hideConversation } = useMessagingContacts();
  const [search, setSearch] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const selectedId = searchParams.get("conversation") || "";
  const allContacts = [...clubContacts, ...contacts];
  const selectedContact = allContacts.find((contact) => contact.id === selectedId) || null;
  const visibleContacts = isClient || directoryOpen || search.trim()
    ? allContacts
    : allContacts.filter((contact) => contact.clubContact || contact.conversation || contact.id === selectedId);
  const filteredContacts = visibleContacts.filter((contact) => normalize([contact.title, contact.email].join(" ")).includes(normalize(search)));

  const selectContact = (contact) => { const next = new URLSearchParams(searchParams); next.set("conversation", contact.id); setSearchParams(next, {state:location.state}); };
  const removeConversation = async (contact) => {
    await hideConversation(contact);
    setSearchParams({});
  };

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
              {user?.role !== "client" && <PlanInclusionBadge included={canUseIntegratedMessaging(user)} />}
              <Text mt={1} color={theme.mutedText}>
                {isClient
                  ? t("messagingRole.clientSubtitle", "Échange simplement avec les professionnels qui t’accompagnent.")
                  : t("messagingRole.professionalSubtitle", "Échange simplement avec tes clients et tes patients.")}
              </Text>
            </Box>
          </HStack>
        </AppSurface>

        {packRequest && <Box mb={4} p={4} borderWidth="1px" borderRadius="xl" bg={theme.surfaceBgStrong}>
          <Text fontWeight="700">{clubText('Demande de pack · {{name}}',{name:packRequest.name})}</Text>
          <Text fontSize="sm">{clubText("Choisissez le club ou le professionnel à contacter. Le message sera préparé pour relecture avant envoi.")}</Text>
        </Box>}
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
                <HStack mb={3} spacing={2}>
                  <InputGroup flex="1" minW={0}>
                    <InputLeftElement pointerEvents="none"><SearchIcon color={theme.mutedText} /></InputLeftElement>
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("clubMessaging.search")} borderRadius="full" />
                  </InputGroup>
                  <IconButton
                    flexShrink={0}
                    borderRadius="full"
                    variant={directoryOpen ? "solid" : "outline"}
                    colorScheme={directoryOpen ? "blue" : undefined}
                    aria-label={t("messaging.startConversation")}
                    title={t("messaging.startConversation")}
                    icon={<AddIcon boxSize="12px" />}
                    onClick={() => setDirectoryOpen((value) => !value)}
                  />
                </HStack>
              ) : null}
              {clubError && <Text role="alert" fontSize="sm">{t("clubMessaging.error")}</Text>}
              {loading ? <Flex py={10} justify="center"><Spinner size="sm" /></Flex> : (
                <MessagingContactList
                  contacts={filteredContacts}
                  selectedId={selectedContact?.id}
                  onSelect={selectContact}
                  onDelete={removeConversation}
                />
              )}
            </Box>

            <Box display={{ base: selectedContact ? "block" : "none", md: "block" }} flex="1" minW={0}>
              {selectedContact ? (
                selectedContact.clubContact
                  ? <ClubThread suggestedClassRequest={suggestedMessage?.conversation === selectedContact.id ? suggestedMessage.classRequest : null} suggestedDraft={suggestedMessage?.conversation === selectedContact.id ? suggestedMessage.text : packRequest?.text} onDraftApplied={clearPackRequest} key={selectedContact.id} contact={selectedContact} preview={false} ownerView={false} onBack={() => setSearchParams({})} t={t} />
                  : <MessagingThread key={selectedContact.id} suggestedDraft={suggestedMessage?.conversation === selectedContact.id ? suggestedMessage.text : packRequest?.text} onDraftApplied={clearPackRequest} contact={selectedContact} onBack={() => setSearchParams({})} />
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
