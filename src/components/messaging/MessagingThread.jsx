import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Spinner,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import {
  collection,
  doc,
  endBefore,
  getDocs,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "../../firebaseConfig";
import { useAuth } from "../../AuthContext";
import { conversationIdForClient, personName, toMessageMillis } from "../../utils/messaging";
import { useAppTheme } from "../../styles/appTheme";

const MAX_MESSAGE_LENGTH = 4000;
const FULL_PAGE_SIZE = 100;
const COMPACT_PAGE_SIZE = 40;

export default function MessagingThread({ contact, compact = false, onBack }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const theme = useAppTheme();
  const [liveMessages, setLiveMessages] = useState([]);
  const [olderMessages, setOlderMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const historyCursorRef = useRef(null);
  const historyLoadedRef = useRef(false);
  const conversationId = conversationIdForClient(contact?.clientId, contact?.coachUid);
  const pageSize = compact ? COMPACT_PAGE_SIZE : FULL_PAGE_SIZE;
  const messages = useMemo(() => {
    const byId = new Map([...olderMessages, ...liveMessages].map((message) => [message.id, message]));
    return [...byId.values()].sort((a, b) => (
      (toMessageMillis(a.createdAt) || toMessageMillis(a.createdAtIso)) -
      (toMessageMillis(b.createdAt) || toMessageMillis(b.createdAtIso))
    ));
  }, [liveMessages, olderMessages]);
  const latestMessageId = messages[messages.length - 1]?.id || "";
  const locale = i18n.resolvedLanguage || i18n.language || "fr";
  const loadErrorLabel = t("messaging.loadError");

  useEffect(() => {
    if (!conversationId || !user?.uid) {
      setLiveMessages([]);
      setOlderMessages([]);
      setHasOlder(false);
      setLoading(false);
      return undefined;
    }
    setLiveMessages([]);
    setOlderMessages([]);
    setHasOlder(false);
    historyCursorRef.current = null;
    historyLoadedRef.current = false;
    setLoading(true);
    const messagesQuery = query(
      collection(db, "conversations", conversationId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(pageSize)
    );
    return onSnapshot(messagesQuery, (snapshot) => {
      setLiveMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      if (!historyLoadedRef.current) {
        historyCursorRef.current = snapshot.docs[0] || null;
        setHasOlder(snapshot.size === pageSize);
      }
      setLoading(false);
      setError("");
    }, () => {
      setLoading(false);
      setError(loadErrorLabel);
    });
  }, [conversationId, loadErrorLabel, pageSize, user?.uid]);

  const loadOlderMessages = async () => {
    const cursor = historyCursorRef.current;
    if (!cursor || !conversationId || loadingOlder) return;
    setLoadingOlder(true);
    setError("");
    try {
      const snapshot = await getDocs(query(
        collection(db, "conversations", conversationId, "messages"),
        orderBy("createdAt", "asc"),
        endBefore(cursor),
        limitToLast(pageSize)
      ));
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      historyLoadedRef.current = true;
      if (snapshot.docs.length) historyCursorRef.current = snapshot.docs[0];
      setOlderMessages((current) => {
        const byId = new Map([...rows, ...current].map((message) => [message.id, message]));
        return [...byId.values()];
      });
      setHasOlder(snapshot.size === pageSize);
    } catch {
      setError(loadErrorLabel);
    } finally {
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    if (!conversationId || !user?.uid || !latestMessageId) return;
    setDoc(doc(db, "conversations", conversationId), {
      readAtBy: { [user.uid]: serverTimestamp() },
    }, { merge: true }).catch(() => {});
  }, [conversationId, latestMessageId, user?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? "smooth" : "auto", block: "end" });
  }, [latestMessageId]);

  const groupedMessages = useMemo(() => messages.map((message) => ({
    ...message,
    createdAtMillis: toMessageMillis(message.createdAt) || toMessageMillis(message.createdAtIso),
  })), [messages]);
  const lastOwnMessageId = useMemo(
    () => [...groupedMessages].reverse().find((message) => message.senderUid === user?.uid)?.id || "",
    [groupedMessages, user?.uid]
  );
  const recipientUid = user?.uid === contact?.clientUid ? contact?.coachUid : contact?.clientUid;
  const recipientReadAt = toMessageMillis(contact?.conversation?.readAtBy?.[recipientUid]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !conversationId || !user?.uid || sending) return;
    if (!contact?.clientUid || !contact?.coachUid) {
      setError(t("messaging.unlinkedAccount"));
      return;
    }
    setSending(true);
    setError("");
    const nowIso = new Date().toISOString();
    const participantUids = [...new Set([...(contact.participantUids || []), contact.clientUid, contact.coachUid, user.uid].filter(Boolean))];
    try {
      const batch = writeBatch(db);
      const conversationRef = doc(db, "conversations", conversationId);
      const messageRef = doc(collection(db, "conversations", conversationId, "messages"));
      batch.set(conversationRef, {
        clientId: contact.clientId,
        clientUid: contact.clientUid,
        coachUid: contact.coachUid,
        professionalUid: contact.coachUid,
        participantUids,
        clientName: contact.clientName || (user.uid === contact.clientUid ? personName(user) : contact.title),
        professionalName: contact.professionalName || (user.uid === contact.coachUid ? personName(user) : contact.title),
        lastMessage: text.slice(0, 180),
        lastMessageAt: serverTimestamp(),
        lastMessageAtIso: nowIso,
        lastSenderUid: user.uid,
        updatedAt: serverTimestamp(),
        readAtBy: { [user.uid]: serverTimestamp() },
      }, { merge: true });
      batch.set(messageRef, {
        text,
        senderUid: user.uid,
        createdAt: serverTimestamp(),
        createdAtIso: nowIso,
        type: "text",
      });
      await batch.commit();
      setDraft("");
    } catch {
      setError(t("messaging.sendError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Flex direction="column" minH={0} h="100%" bg={theme.surfaceBgStrong}>
      <HStack px={{ base: 3, md: 4 }} py={3} borderBottom="1px solid" borderColor={theme.borderColor}>
        {onBack ? <IconButton size="sm" variant="ghost" borderRadius="full" aria-label={t("common.back")} icon={<ArrowBackIcon />} onClick={onBack} /> : null}
        <Avatar size="sm" name={contact?.title} />
        <Box minW={0}>
          <Text fontWeight="900" noOfLines={1}>{contact?.title || t("messaging.conversation")}</Text>
          <Text fontSize="xs" color={theme.mutedText}>{t("messaging.privateConversation")}</Text>
        </Box>
      </HStack>

      <VStack
        flex="1"
        minH={0}
        overflowY="auto"
        align="stretch"
        spacing={2.5}
        px={{ base: 3, md: 4 }}
        py={3}
      >
        {loading ? <Flex flex="1" align="center" justify="center"><Spinner size="sm" /></Flex> : null}
        {!compact && !loading && hasOlder ? (
          <Button
            alignSelf="center"
            size="sm"
            variant="ghost"
            borderRadius="full"
            isLoading={loadingOlder}
            onClick={() => void loadOlderMessages()}
          >
            {t("messaging.loadPrevious", "Charger les messages précédents")}
          </Button>
        ) : null}
        {!loading && !groupedMessages.length ? (
          <Box textAlign="center" py={8} px={4}>
            <Text fontWeight="900">{t("messaging.emptyTitle")}</Text>
            <Text mt={1} fontSize="sm" color={theme.mutedText}>{t("messaging.emptyBody")}</Text>
          </Box>
        ) : null}
        {groupedMessages.map((message) => {
          const mine = message.senderUid === user?.uid;
          const showReceipt = mine && message.id === lastOwnMessageId;
          const isRead = showReceipt && recipientReadAt >= message.createdAtMillis;
          return (
            <Flex key={message.id} justify={mine ? "flex-end" : "flex-start"}>
              <Box
                maxW="82%"
                px={3}
                py={2}
                borderRadius={mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px"}
                bg={mine ? "#257CFF" : theme.surfaceSoft}
                color={mine ? "white" : theme.textColor}
                border={mine ? "none" : "1px solid"}
                borderColor={theme.borderColor}
              >
                <Text fontSize="sm" whiteSpace="pre-wrap" overflowWrap="anywhere">{message.text}</Text>
                <HStack mt={1} justify="flex-end" spacing={1} opacity={0.76}>
                  <Text fontSize="10px">
                    {message.createdAtMillis
                      ? new Date(message.createdAtMillis).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
                      : t("messaging.sending")}
                  </Text>
                  {showReceipt ? (
                    <Text fontSize="10px" fontWeight="800">
                      {isRead ? `✓✓ ${t("messaging.read")}` : `✓ ${t("messaging.sent")}`}
                    </Text>
                  ) : null}
                </HStack>
              </Box>
            </Flex>
          );
        })}
        <Box ref={bottomRef} />
      </VStack>

      <Box p={3} borderTop="1px solid" borderColor={theme.borderColor}>
        {error ? <Text mb={2} fontSize="xs" color="red.500">{error}</Text> : null}
        <HStack align="end" spacing={2}>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={t("messaging.placeholder")}
            aria-label={t("messaging.placeholder")}
            resize="none"
            minH="42px"
            maxH="110px"
            rows={1}
            borderRadius="16px"
          />
          <Button colorScheme="blue" borderRadius="full" px={5} isLoading={sending} isDisabled={!draft.trim()} onClick={sendMessage}>
            {t("messaging.send")}
          </Button>
        </HStack>
      </Box>
    </Flex>
  );
}
