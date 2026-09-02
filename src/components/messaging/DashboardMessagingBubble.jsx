import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Portal,
  Spinner,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { AddIcon, ArrowBackIcon, CloseIcon, SearchIcon } from "@chakra-ui/icons";
import { MdOutlineChat } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MessagingContactList from "./MessagingContactList";
import MessagingThread from "./MessagingThread";
import useMessagingContacts from "./useMessagingContacts";
import { useAuth } from "../../AuthContext";
import { useAppTheme } from "../../styles/appTheme";

const MESSAGING_NOTIFICATION_STORAGE_PREFIX = "byl:messaging:notified:v1:";

const normalizeSearch = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

export default function DashboardMessagingBubble() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const theme = useAppTheme();
  const { user } = useAuth();
  const { contacts, loading, unreadCount, isClient, hideConversation } = useMessagingContacts();
  const [open, setOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const panelRef = useRef(null);
  const launcherRef = useRef(null);
  const previousActivityByContactRef = useRef(new Map());
  const panelBg = useColorModeValue("rgba(255,255,255,0.98)", "rgba(10,15,28,0.98)");
  const shadow = useColorModeValue("0 22px 70px rgba(15,23,42,0.24)", "0 22px 70px rgba(0,0,0,0.52)");

  useEffect(() => {
    if (selectedContact) {
      const refreshedContact = contacts.find((contact) => contact.id === selectedContact.id);
      if (!refreshedContact) setSelectedContact(null);
      else if (refreshedContact !== selectedContact) setSelectedContact(refreshedContact);
    }
  }, [contacts, selectedContact]);

  useEffect(() => {
    const storageKey = `${MESSAGING_NOTIFICATION_STORAGE_PREFIX}${user?.uid || "anonymous"}`;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      previousActivityByContactRef.current = new Map(
        Object.entries(saved).map(([contactId, activity]) => [contactId, Number(activity) || 0])
      );
    } catch {
      previousActivityByContactRef.current = new Map();
    }
  }, [user?.uid]);

  useEffect(() => {
    const notifiedActivities = new Map(previousActivityByContactRef.current);
    let newlyReceived = null;
    let hasChanges = false;
    contacts.forEach((contact) => {
      const activity = contact.lastActivityAt || 0;
      if (!activity) return;
      const previousActivity = notifiedActivities.get(contact.id);
      if (previousActivity === undefined) {
        notifiedActivities.set(contact.id, activity);
        hasChanges = true;
        return;
      }
      if (
        contact.unread &&
        activity > previousActivity &&
        (!newlyReceived || activity > newlyReceived.lastActivityAt)
      ) newlyReceived = contact;
    });
    if (newlyReceived) {
      contacts.forEach((contact) => {
        const activity = contact.lastActivityAt || 0;
        if (contact.unread && activity > (notifiedActivities.get(contact.id) || 0)) {
          notifiedActivities.set(contact.id, activity);
          hasChanges = true;
        }
      });
    }
    previousActivityByContactRef.current = notifiedActivities;
    if (hasChanges && user?.uid) {
      try {
        window.localStorage.setItem(
          `${MESSAGING_NOTIFICATION_STORAGE_PREFIX}${user.uid}`,
          JSON.stringify(Object.fromEntries([...notifiedActivities.entries()].slice(-200)))
        );
      } catch {
        // Le suivi en mémoire évite déjà les doublons pendant la session courante.
      }
    }
    if (!newlyReceived) return;
    toast({
      title: t("messaging.newMessage", "Nouveau message"),
      description: newlyReceived.title,
      status: "info",
      duration: 1800,
      isClosable: false,
      position: "top-right",
      containerStyle: { maxWidth: "260px" },
    });
  }, [contacts, t, toast, user?.uid]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = (event) => {
      if (panelRef.current?.contains(event.target) || launcherRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [open]);

  const visibleContacts = (isClient || directoryOpen
    ? contacts
    : contacts.filter((contact) => contact.conversation))
    .filter((contact) => normalizeSearch([contact.title, contact.email].join(" ")).includes(normalizeSearch(search)))
    .slice(0, 8);

  return (
    <Portal>
      {open ? (
        <Flex
          ref={panelRef}
          position="fixed"
          zIndex={1400}
          right={{ base: 3, md: 6 }}
          left={{ base: 3, md: "auto" }}
          bottom={{ base: "92px", md: "82px" }}
          w={{ base: "auto", md: "380px" }}
          h={{ base: "min(66vh, 560px)", md: "560px" }}
          maxH="calc(100vh - 120px)"
          direction="column"
          overflow="hidden"
          border="1px solid"
          borderColor={theme.borderColor}
          borderRadius="24px"
          bg={panelBg}
          boxShadow={shadow}
          backdropFilter="blur(18px)"
        >
          <HStack px={3} py={2} justify="space-between" borderBottom="1px solid" borderColor={theme.borderColor}>
            <Button
              variant="ghost"
              borderRadius="full"
              px={2}
              aria-label={t("messaging.openFull", "Ouvrir toute la messagerie")}
              onClick={() => {
                setOpen(false);
                navigate("/messages");
              }}
            >
              <HStack spacing={2}>
                <Icon as={MdOutlineChat} boxSize="20px" color="#257CFF" />
                <Text fontWeight="900">{t("messaging.title")}</Text>
                {unreadCount ? <Badge colorScheme="blue" borderRadius="full">{unreadCount}</Badge> : null}
              </HStack>
            </Button>
            <IconButton
              display={{ base: "inline-flex", md: "none" }}
              size="sm"
              variant="ghost"
              borderRadius="full"
              aria-label={t("common.close")}
              icon={<CloseIcon boxSize="12px" />}
              onClick={() => setOpen(false)}
            />
          </HStack>

          <Box flex="1" minH={0} overflow="hidden">
            {loading ? <Flex h="full" align="center" justify="center"><Spinner size="sm" /></Flex> : selectedContact ? (
              <MessagingThread
                contact={selectedContact}
                compact
                onBack={() => setSelectedContact(null)}
              />
            ) : (
              <Box h="full" overflowY="auto" p={3}>
                {!isClient ? (
                  <>
                    {directoryOpen ? (
                      <HStack mb={3} spacing={2} align="center">
                        <IconButton
                          flexShrink={0}
                          size="md"
                          variant="outline"
                          borderRadius="full"
                          aria-label={t("common.back", "Retour")}
                          icon={<ArrowBackIcon boxSize="18px" />}
                          onClick={() => {
                            setDirectoryOpen(false);
                            setSearch("");
                          }}
                        />
                        <InputGroup flex="1" minW={0}>
                          <InputLeftElement pointerEvents="none"><SearchIcon color={theme.mutedText} /></InputLeftElement>
                          <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t("messaging.search")}
                            borderRadius="full"
                          />
                        </InputGroup>
                      </HStack>
                    ) : (
                      <Button
                        w="full"
                        mb={3}
                        variant="outline"
                        borderRadius="full"
                        leftIcon={<AddIcon boxSize="10px" />}
                        onClick={() => setDirectoryOpen(true)}
                      >
                        {t("messaging.startConversation")}
                      </Button>
                    )}
                  </>
                ) : null}
                <MessagingContactList
                  contacts={visibleContacts}
                  compact
                  onSelect={(contact) => {
                    setSelectedContact(contact);
                    setDirectoryOpen(false);
                  }}
                  onDelete={hideConversation}
                />
              </Box>
            )}
          </Box>
        </Flex>
      ) : null}

      <Box
        ref={launcherRef}
        display={{ base: open ? "none" : "block", md: "block" }}
        position="fixed"
        zIndex={1350}
        right={{ base: 4, md: 6 }}
        bottom={{ base: "92px", md: 5 }}
      >
        <IconButton
          w="56px"
          h="56px"
          borderRadius="full"
          colorScheme="blue"
          bg="#257CFF"
          color="white"
          boxShadow="0 14px 32px rgba(37,124,255,0.38)"
          aria-label={open ? t("common.close") : t("messaging.open")}
          icon={<Icon as={open ? CloseIcon : MdOutlineChat} boxSize="24px" />}
          onClick={() => setOpen((value) => !value)}
        />
        {unreadCount ? (
          <Badge
            position="absolute"
            top="-4px"
            right="-4px"
            minW="22px"
            h="22px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            bg="red.500"
            color="white"
            fontWeight="900"
            border="2px solid"
            borderColor={panelBg}
            aria-label={`${unreadCount} ${t("messaging.unread", "message(s) non lu(s)")}`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        ) : null}
      </Box>
    </Portal>
  );
}
