import {clubText} from '../../i18n/clubText';
import {useTranslation} from 'react-i18next';
import { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { api } from './clubMessagingApi';

// Shared by the full inbox and dashboard: club replies use the same read state.
export default function useMemberClubContacts({includeOwners=false}={}) {
  const { user } = useAuth();
  const {i18n}=useTranslation();
  const [state, setState] = useState({ contacts: [], error: false });
  useEffect(() => {
    setState({ contacts: [], error: false });
    if (!user?.uid) return;
    const controller = new AbortController();
    let timer;
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      clearTimeout(timer);
      try {
        const result = await api('contacts', null, controller.signal);
        if (!controller.signal.aborted) setState({
          contacts: result.ownerView&&!includeOwners ? [] : result.contacts.map(contact => ({
            ...contact, ownerView:result.ownerView, lastMessage:clubText(contact.lastMessage), id: `club:${contact.id}`, clubContact: true,
            lastActivityAt: contact.lastMessageAt || 0,
          })), error: false,
        });
      } catch {
        if (!controller.signal.aborted) setState(previous => ({ ...previous, error: true }));
      } finally {
        busy = false;
        if (!controller.signal.aborted) timer = setTimeout(refresh, 10000);
      }
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('club-messages-read', refresh);
    return () => {
      controller.abort(); clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('club-messages-read', refresh);
    };
  }, [user?.uid,i18n.language,includeOwners]);
  return state;
}
