import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { clubText } from '../../i18n/clubText';
import { useMessagingFeed } from './messagingFeed';

export function mergeContacts(directory, active) {
  const byId = new Map(directory.map(c => [c.id,c]));
  for (const c of active) byId.set(c.id,{...byId.get(c.id),...c});
  return [...byId.values()];
}

export default function useMemberClubContacts({includeOwners=false, compose=false, selected=''}={}) {
  const {i18n} = useTranslation();
  const inbox = useMessagingFeed();
  const needsTarget = selected.startsWith('club:') && !inbox.error && !inbox.loading && !inbox.contacts.some(c=>'club:'+c.id===selected);
  const feed = useMessagingFeed({ compose:compose || needsTarget });
  const contacts = useMemo(() => feed.ownerView && !includeOwners ? [] :
    mergeContacts(feed.directory,feed.contacts).map(c=>({...c,ownerView:feed.ownerView,
      lastMessage:clubText(c.lastMessage || ''),id:'club:'+c.id,clubContact:true,lastActivityAt:c.lastMessageAt || 0})),
    [feed.contacts,feed.directory,feed.ownerView,includeOwners,i18n.language]);
  return {contacts, error:feed.error || feed.directoryError};
}
