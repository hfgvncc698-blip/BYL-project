import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { auth } from '../../firebaseConfig';
import { useMessagingFeed } from './messagingFeed';
import { api } from './clubMessagingApi';
const threads = new Map();
const initial = {
  messages: [],
  loading: true,
  more: false,
  error: false
};
const compare = (a, b) => a.createdAtIso.localeCompare(b.createdAtIso) || a.id.localeCompare(b.id);
export const stampOrder = (a, b) => {
  const [s, n] = (a || '0:0').split(':').map(Number),
    [t, m] = (b || '0:0').split(':').map(Number);
  return s - t || n - m;
};
function makeThread(key, account, contact) {
  const params = new URLSearchParams({
    clubId: contact.clubId,
    kind: contact.kind,
    targetId: contact.targetId,
    receipt: 'visible'
  });
  const entry = {
    account,
    state: initial,
    rows: new Map(),
    listeners: new Set(),
    generation: 0,
    after: '',
    older: '',
    lastVersion: null
  };
  function valid(generation) {
    return entry.generation === generation && account === auth.currentUser && entry.listeners.size > 0;
  }
  function publish(fields) {
    entry.state = {
      ...entry.state,
      ...fields
    };
    entry.listeners.forEach(fn => fn());
  }
  function cancel(purge) {
    entry.generation++;
    entry.controller?.abort();
    entry.historyController?.abort();
    entry.pending = false;
    entry.lastVersion = null;
    if (purge) {
      entry.rows.clear();
      entry.after = '';
      entry.older = '';
    }
    publish({
      ...initial,
      loading: false,
      error: true,
      denied: purge
    });
  }
  async function sync(version, supportsDelta = entry.supportsDelta) {
    entry.supportsDelta = supportsDelta;
    if (entry.lastVersion === version || !entry.listeners.size) return;
    entry.wanted = version;
    if (entry.pending) return;
    entry.pending = true;
    const generation = entry.generation;
    const controller = new AbortController();
    entry.controller = controller;
    try {
      do {
        const desired = entry.wanted;
        const query = new URLSearchParams(params);
        if (entry.after && entry.supportsDelta) query.set('after', entry.after);
        const previousIds = new Set(entry.rows.keys());
        let checkpoint;
        let page;
        do {
          page = await api('messages?' + query, null, controller.signal, account);
          if (!valid(generation)) return;
          checkpoint ||= page.after;
          const overlaps = page.messages.some(m => previousIds.has(m.id));
          for (const message of page.messages) if (message.createdAtIso) entry.rows.set(message.id, message);
          if (!query.has('after')) {
            // A historical writer may lack committedAt. Bridge pages to the previous window.
            if (previousIds.size && !overlaps && page.more) {
              query.set('before', page.cursor);
              continue;
            }
            if (!previousIds.size || !overlaps) entry.older = page.more ? page.cursor : '';
            break;
          }
          query.set('after', page.after);
          if (page.afterId) query.set('afterId', page.afterId);
        } while (page.more);
        entry.after = query.has('after') ? page.after : checkpoint;
        entry.lastVersion = desired;
        publish({
          messages: [...entry.rows.values()].sort(compare),
          loading: false,
          error: false,
          denied: false,
          more: !!entry.older
        });
      } while (entry.lastVersion !== entry.wanted);
    } catch (error) {
      if (valid(generation)) cancel([401, 403].includes(error.status));
    } finally {
      if (valid(generation)) entry.pending = false;
    }
  }
  async function older() {
    if (!entry.older || entry.historyController) return;
    const generation = entry.generation;
    const controller = new AbortController();
    entry.historyController = controller;
    try {
      const page = await api('messages?' + params + '&before=' + encodeURIComponent(entry.older), null, controller.signal, account);
      if (!valid(generation)) return;
      // A concurrently received edit is newer than a historical page.
      for (const msg of page.messages) if (!entry.rows.has(msg.id)) entry.rows.set(msg.id, msg);
      entry.older = page.more ? page.cursor : '';
      publish({
        messages: [...entry.rows.values()].sort(compare),
        more: !!entry.older
      });
    } catch (error) {
      if (valid(generation)) cancel([401, 403].includes(error.status));
    } finally {
      if (entry.historyController === controller) entry.historyController = null;
    }
  }
  Object.assign(entry, {
    sync,
    olderPage: older,
    reload: () => sync('mutation:' + Date.now()),
    cancel,
    snapshot: () => entry.state,
    subscribe: fn => {
      threads.set(key, entry);
      entry.listeners.add(fn);
      return () => {
        entry.listeners.delete(fn);
        queueMicrotask(() => {
          if (!entry.listeners.size && threads.get(key) === entry) {
            cancel(true);
            threads.delete(key);
          }
        });
      };
    }
  });
  return entry;
}
export function useClubThread(contact, ownerView) {
  const feed = useMessagingFeed({
    scope: ownerView ? contact.clubId : '', focusedThread:contact
  });
  const account = auth.currentUser;
  const key = JSON.stringify([feed.scopeKey, contact.clubId, contact.kind, contact.targetId, contact.peerUid]);
  const entry = useMemo(() => {
    let value = threads.get(key);
    if (!value || value.account !== account) {
      value = makeThread(key, account, contact);
      threads.set(key, value);
    }
    return value;
  }, [key, account]);
  const state = useSyncExternalStore(entry.subscribe, entry.snapshot, entry.snapshot);
  const active = feed.contacts.find(c => c.clubId === contact.clubId && c.kind === contact.kind && c.targetId === contact.targetId);
  const withdrawn=feed.deniedThread===JSON.stringify([contact.clubId,contact.kind,contact.targetId]);
  useEffect(() => {
    if(withdrawn){entry.cancel(true);return;}
    if (!account || feed.error || !feed.scopeKey) {
      entry.cancel(!account || !feed.scopeKey || !!feed.denied);
      return;
    }
    if (feed.loading) return;
    if (active && active.peerUid !== contact.peerUid) {
      entry.cancel(true);
      return;
    }
    // Empty/new threads also check their authorization at each inbox heartbeat.
    const version = active?.activityVersion || 'empty:' + feed.checked;
    entry.sync(state.error ? version + ':retry:' + feed.checked : version, active?.deltaSupported);
  }, [account, entry, withdrawn, feed.error, feed.denied, feed.scopeKey, feed.loading, feed.checked, active?.peerUid, active?.activityVersion, active?.deltaSupported, contact.peerUid]);
  return {
    ...state,
    denied:withdrawn || state.denied,
    messages: withdrawn || feed.error || !feed.scopeKey ? [] : state.messages,
    active,
    older: entry.olderPage,
    reload: entry.reload
  };
}
