import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { db } from "../../firebaseConfig";
import { useAuth } from "../../AuthContext";
import {
  conversationUnreadFor,
  loadClientMessagingContacts,
  loadCoachMessagingContacts,
  personName,
  toMessageMillis,
} from "../../utils/messaging";

export default function useMessagingContacts() {
  const { t } = useTranslation();
  const { user, effectiveRole, isAdmin } = useAuth();
  const location = useLocation();
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const isClient = user?.role === "particulier";
  const userUid = user?.uid || "";
  const userEmail = user?.email || "";
  const userLinkedClientId = user?.linkedClientId || "";
  const userDisplayName = user?.displayName || "";
  const userFirstName = user?.firstName || user?.firstname || user?.prenom || "";
  const userLastName = user?.lastName || user?.lastname || user?.nom || "";
  const professionalLabel = t("messaging.professional");
  const adminCoachId = new URLSearchParams(location.search).get("adminCoachId") || "";
  const effectiveCoachUid = effectiveRole === "coach" ? (adminCoachId || userUid) : "";

  useEffect(() => {
    let active = true;
    if (!userUid) {
      setContacts([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const messagingUser = {
      uid: userUid,
      email: userEmail,
      linkedClientId: userLinkedClientId,
      displayName: userDisplayName,
      firstName: userFirstName,
      lastName: userLastName,
      role: user?.role,
    };
    const load = isClient
      ? loadClientMessagingContacts(messagingUser, professionalLabel)
      : loadCoachMessagingContacts({
          currentUid: userUid,
          effectiveCoachUid: effectiveCoachUid || undefined,
          isAdmin,
        }).then((rows) => rows.map((contact) => ({
          ...contact,
          professionalName: personName(messagingUser, professionalLabel),
        })));
    load.then((rows) => {
      if (active) setContacts(rows);
    }).catch(() => {
      if (active) setContacts([]);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [adminCoachId, effectiveCoachUid, isAdmin, isClient, professionalLabel, user?.role, userDisplayName, userEmail, userFirstName, userLastName, userLinkedClientId, userUid]);

  useEffect(() => {
    if (!user?.uid || !contacts.length) {
      setConversations([]);
      return undefined;
    }
    let active = true;
    setConversations([]);
    const unsubscribe = contacts.map((contact) => onSnapshot(
      doc(db, "conversations", contact.id),
      (snapshot) => {
        if (!active) return;
        setConversations((current) => {
          const next = new Map(current.map((conversation) => [conversation.id, conversation]));
          if (snapshot.exists()) next.set(snapshot.id, { id: snapshot.id, ...snapshot.data() });
          else next.delete(contact.id);
          return [...next.values()];
        });
      },
      () => {
        if (!active) return;
        setConversations((current) => current.filter((conversation) => conversation.id !== contact.id));
      }
    ));
    return () => {
      active = false;
      unsubscribe.forEach((stopListening) => stopListening());
    };
  }, [contacts, user?.uid]);

  const conversationById = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations]
  );

  const enrichedContacts = useMemo(() => contacts.map((contact) => {
    const conversation = conversationById.get(contact.id) || null;
    const lastActivityAt = toMessageMillis(conversation?.lastMessageAt) || toMessageMillis(conversation?.lastMessageAtIso);
    const hiddenAtMillis = toMessageMillis(conversation?.hiddenAtBy?.[user?.uid]);
    const isHidden = Boolean(conversation && hiddenAtMillis && lastActivityAt <= hiddenAtMillis);
    return {
      ...contact,
      conversation: isHidden ? null : conversation,
      hiddenAtMillis,
      unread: isHidden ? false : conversationUnreadFor(conversation, user?.uid),
      lastActivityAt: isHidden ? 0 : lastActivityAt,
    };
  }).sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0) || a.title.localeCompare(b.title)), [contacts, conversationById, user?.uid]);

  const hideConversation = async (contact) => {
    if (!contact?.conversation || !contact?.id || !user?.uid) return;
    try {
      await updateDoc(doc(db, "conversations", contact.id), {
        [`hiddenAtBy.${user.uid}`]: serverTimestamp(),
        [`readAtBy.${user.uid}`]: serverTimestamp(),
      });
    } catch {
      throw new Error(t("messaging.deleteConversationError"));
    }
  };

  return {
    contacts: enrichedContacts,
    loading,
    unreadCount: enrichedContacts.filter((contact) => contact.unread).length,
    isClient,
    hideConversation,
  };
}
