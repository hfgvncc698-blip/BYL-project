import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useLocation } from 'react-router-dom';
import { db } from '../../firebaseConfig';
import { useAuth } from '../../AuthContext';
import { clubText } from '../../i18n/clubText';
import { cancellationPreview } from '../../utils/cancellationPreview.mjs';
import { useMessagingFeed } from './messagingFeed';
import { mergeContacts } from './useMemberClubContacts';

export default function useMessagingContacts({compose=false, selected=''}={}) {
  const {user,effectiveRole,isAdmin}=useAuth();
  const {t,i18n}=useTranslation();
  const location=useLocation();
  const scope = isAdmin && effectiveRole==='coach' ? new URLSearchParams(location.search).get('adminCoachId') || '' : '';
  const inbox=useMessagingFeed({professional:true,scope});
  const needsTarget = selected && !selected.startsWith('club:') && !inbox.error && !inbox.loading && !inbox.contacts.some(c=>c.id===selected);
  const feed=useMessagingFeed({professional:true,scope,compose:compose || needsTarget});
  const contacts=useMemo(()=>mergeContacts(feed.directory,feed.contacts).map(c=>({...c,
    hiddenAtMillis:c.hiddenAtMillis || feed.hiddenAtByConversation?.[c.id] || 0,
    title:c.title || t('messaging.professional'),lastMessage:cancellationPreview(c,clubText)}))
    .sort((a,b)=>(b.lastActivityAt||0)-(a.lastActivityAt||0)||a.title.localeCompare(b.title)),
    [feed.contacts,feed.directory,feed.hiddenAtByConversation,i18n.language,t]);
  const hideConversation=async c=>{
    if(!user?.uid || !c.conversation) return;
    await updateDoc(doc(db,'conversations',c.id),{[`hiddenAtBy.${user.uid}`]:serverTimestamp(),[`readAtBy.${user.uid}`]:serverTimestamp()});
  };
  return {contacts,loading:feed.loading,error:feed.error||feed.directoryError,isClient:user?.role==='particulier',hideConversation,
    unreadCount:contacts.filter(c=>c.unread).length};
}
