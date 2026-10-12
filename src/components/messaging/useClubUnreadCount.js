import { useEffect, useState } from 'react';
import { api } from './clubMessagingApi';

export default function useClubUnreadCount(clubId) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    if (!clubId) return;
    const controller = new AbortController();
    let timer;
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      clearTimeout(timer);
      try {
        const data = await api(`contacts?clubId=${encodeURIComponent(clubId)}`, null, controller.signal);
        if (!controller.signal.aborted) setCount(data.contacts.filter(contact => contact.unread).length);
      } catch { /* Keep the last confirmed count on a temporary connection failure. */ }
      finally {
        busy = false;
        if (!controller.signal.aborted) timer = setTimeout(refresh, 20000);
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
  }, [clubId]);
  return count;
}
