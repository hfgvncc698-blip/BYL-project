import { localSessionStorage } from "../../utils/privateStorage.js";
import { useMessagingIdentity } from './messagingFeed';
import PlanInclusionBadge from "../../components/PlanInclusionBadge";
import { canUseIntegratedMessaging } from "../../utils/proPlanAccess";
import useMemberClubContacts from './useMemberClubContacts';
const ClubThread = lazy(() => import('./ClubMessagingPanel').then(module => ({default:module.ClubThread})));
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { AddIcon, CloseIcon, SearchIcon } from "@chakra-ui/icons";
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

function notificationTime(value) {
  const match=/^(\d{1,13})(?::(\d{1,9}))?$/.exec(String(value || ''));
  if(!match) return 0n;
  return match[2]===undefined ? BigInt(match[1])*1000000n : BigInt(match[1])*1000000000n+BigInt(match[2]);
}
export default function DashboardMessagingBubble(props) {
  const scope=useMessagingIdentity();
  return scope ? <MessagingBubble key={scope} {...props}/> : null;
}
function MessagingBubble({notificationsOnly=false}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const theme = useAppTheme();
  const { user } = useAuth();
  const [open,setOpen]=useState(false);
  const [selectedContact,setSelectedContact]=useState(null);
  const [directoryOpen,setDirectoryOpen]=useState(false);
  const [search,setSearch]=useState('');
  const compose=open && !notificationsOnly && (directoryOpen || !!search);
  const { contacts: professionalContacts, loading, error:proError, isClient, hideConversation } = useMessagingContacts({compose,selected:open && !notificationsOnly ? selectedContact?.id || '' : ''});
  const { contacts: clubContacts, error:clubError } = useMemberClubContacts({includeOwners:true,compose,selected:open && !notificationsOnly ? selectedContact?.id || '' : ''});
  const contacts = useMemo(() => [...professionalContacts, ...clubContacts].sort((a,b)=>b.lastActivityAt-a.lastActivityAt), [professionalContacts,clubContacts]);
  const unreadCount=contacts.filter(c=>c.unread).length;
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
      const saved = JSON.parse(localSessionStorage.getItem(storageKey) || "{}");
      previousActivityByContactRef.current = new Map(
        Object.entries(saved).map(([contactId, activity]) => [contactId, activity])
      );
    } catch {
      previousActivityByContactRef.current = new Map();
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    let live=true;
    const key=MESSAGING_NOTIFICATION_STORAGE_PREFIX+user.uid;
    const notify=()=>{
      if(!live || document.hidden) return;
      const saved=previousActivityByContactRef.current;
      try { for(const [id,v] of Object.entries(JSON.parse(localSessionStorage.getItem(key)||'{}'))) saved.set(id,v); } catch { /* local fallback */ }
      let changed=false;
      for(const c of contacts){
        if(!c.unread) continue;
        const version=c.receivedVersion || String(c.lastActivityAt);
        const old=saved.get(c.id);
        if(notificationTime(version)<=notificationTime(old)) continue;
        saved.delete(c.id); saved.set(c.id,version); changed=true;
        toast({ id:'message-'+c.id+'-'+version, title:t('messaging.newMessage','Nouveau message'),description:c.title,
          status:'info',duration:1800,isClosable:false,position:'top-right',containerStyle:{maxWidth:'260px'} });
      }
      if(changed) try { localSessionStorage.setItem(key,JSON.stringify(Object.fromEntries([...saved].slice(-200)))); } catch { /* local fallback */ }
    };
    const check=()=>{if(navigator.locks) navigator.locks.request(key,notify).catch(()=>{});else notify();};
    check(); document.addEventListener('visibilitychange',check);
    return ()=>{live=false;document.removeEventListener('visibilitychange',check);};
  },[contacts,t,toast,user?.uid]);

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
    : contacts.filter((contact) => contact.conversation || contact.clubContact))
    .filter((contact) => normalizeSearch([contact.title, contact.email].join(" ")).includes(normalizeSearch(search)))
    .slice(0, 8);

  if(notificationsOnly)return null;
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
              {user?.role !== "client" && <PlanInclusionBadge included={canUseIntegratedMessaging(user)} />}
                {unreadCount ? <Badge bg="red.500" color="white" borderRadius="full">{unreadCount}</Badge> : null}
              </HStack>
            </Button>
            <HStack spacing={1}>
              {!selectedContact ? (
                <IconButton
                  size="sm"
                  borderRadius="full"
                  variant={directoryOpen ? "solid" : "outline"}
                  colorScheme={directoryOpen ? "blue" : undefined}
                  aria-label={t("messaging.startConversation")}
                  title={t("messaging.startConversation")}
                  icon={<AddIcon boxSize="11px" />}
                  onClick={() => {
                    setDirectoryOpen((value) => !value);
                    setSearch("");
                  }}
                />
              ) : null}
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
          </HStack>

          {(proError || clubError) && <Text role="alert" px={3}>{t("clubMessaging.error")}</Text>}
          <Box flex="1" minH={0} overflow="hidden">
            {loading ? <Flex h="full" align="center" justify="center"><Spinner size="sm" /></Flex> : selectedContact ? (
              selectedContact.clubContact ? <Suspense fallback={<Spinner />}><ClubThread key={selectedContact.id} contact={selectedContact} preview={false} ownerView={!!selectedContact.ownerView} onBack={() => setSelectedContact(null)} t={t} /></Suspense> : <MessagingThread
                contact={selectedContact}
                compact
                onBack={() => setSelectedContact(null)}
              />
            ) : (
              <Box h="full" overflowY="auto" p={3}>
                {!isClient || directoryOpen ? (
                  <InputGroup mb={3}>
                    <InputLeftElement pointerEvents="none"><SearchIcon color={theme.mutedText} /></InputLeftElement>
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t("messaging.search")}
                      borderRadius="full"
                    />
                  </InputGroup>
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
