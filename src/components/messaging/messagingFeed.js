import { useEffect, useSyncExternalStore } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { clearSessionDrafts } from '../../hooks/useSessionDraft';
import i18n from '../../i18n/index';
import { useAuth } from '../../AuthContext';
import { loadClientMessagingContacts, loadCoachMessagingContacts, personName } from '../../utils/messaging';
import { api } from './clubMessagingApi';
const empty = {
  contacts: [],
  directory: [],
  loading: true,
  error: false
};
const entries = new Map();
const authListeners = new Set();
let observing = false;
let previousUid;
const accountNow = () => auth.currentUser;
const noop = () => () => {};
const emptySnapshot = () => empty;
function subscribeAuth(notify) {
  authListeners.add(notify);
  if (!observing) {
    observing = true;
    // Retire the unscoped directory written by previous releases.
    try {
      localStorage.removeItem('byl:messaging:coach-directory:v1');
    } catch {/* unavailable */}
    onAuthStateChanged(auth, account => {
      if (previousUid && previousUid !== account?.uid) {
        for (const prefix of ['message', 'club-message', 'club-request']) clearSessionDrafts(prefix + ':' + previousUid + ':');
        try {
          localStorage.removeItem('byl:messaging:notified:v1:' + previousUid);
        } catch {/* unavailable */}
      }
      previousUid = account?.uid;
      for (const entry of entries.values()) if (entry.account !== account) {
        stop(entry);
      }
      authListeners.forEach(fn => fn());
    });
    window.addEventListener('offline', () => {
      for (const e of entries.values()) {
        e.controller?.abort();
        e.directoryController?.abort();
        publish(e, {
          ...empty,
          loading: false,
          error: true
        });
      }
    });
    const reconnect = () => {
      for (const e of entries.values()) if (e.listeners.size && !e.running) start(e);
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
  }
  return () => authListeners.delete(notify);
}
function publish(entry, value) {
  entry.state = value;
  entry.listeners.forEach(fn => fn());
}
function stop(entry) {
  entry.controller?.abort();
  entry.directoryController?.abort();
  clearTimeout(entry.retry);
  if (entries.get(entry.key) === entry) entries.delete(entry.key);
  publish(entry, empty);
}
async function start(entry) {
  if (entry.account !== auth.currentUser || !navigator.onLine || entry.running) return;
  clearTimeout(entry.retry);
  entry.running = true;
  const controller = new AbortController();
  entry.controller = controller;
  let version = '',
    known = '';
  try {
    while (!controller.signal.aborted && entry.listeners.size) {
      const params = new URLSearchParams();
      if (entry.scope) params.set(entry.professional ? 'coach' : 'clubId', entry.scope);
      if (version) params.set('since', version);
      if (known) params.set('known', known);
      const result = await api('inbox?' + params, null, controller.signal, entry.account, entry.professional);
      if (controller.signal.aborted) return;
      version = result.version;
      known = result.known;
      entry.delay = 1000;
      const lost = entry.state.error;
      publish(entry, {
        ...entry.state,
        ...result,
        loading: false,
        error: false,
        denied: false,
        checked: Date.now()
      });
      if (lost && entry.directoryUsers) directory(entry);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      entry.directoryController?.abort();
      publish(entry, {
        ...empty,
        loading: false,
        error: true,
        denied: [401, 403].includes(error.status)
      });
      entry.retry = setTimeout(() => start(entry), entry.delay);
      entry.delay = Math.min(20000, entry.delay * 2);
    }
  } finally {
    entry.running = false;
    if (controller.signal.aborted && navigator.onLine && entry.listeners.size && entries.get(entry.key) === entry) start(entry);
  }
}
async function directory(entry) {
  if (!entry || !entry.directoryUsers || entry.account !== auth.currentUser) return;
  const controller = new AbortController();
  entry.directoryController?.abort();
  entry.directoryController = controller;
  try {
    let contacts;
    if (!entry.professional) {
      const result = await api('directory' + (entry.scope ? '?clubId=' + encodeURIComponent(entry.scope) : ''), null, controller.signal, entry.account);
      contacts = result.contacts;
    } else if (entry.user.role === 'particulier') {
      contacts = await loadClientMessagingContacts(entry.user, i18n.t('messaging.professional'));
    } else {
      contacts = await loadCoachMessagingContacts({
        currentUid: entry.account.uid,
        effectiveCoachUid: entry.scope || (entry.role === 'coach' ? entry.account.uid : undefined),
        isAdmin: entry.isAdmin
      });
      contacts = contacts.map(c => ({
        ...c,
        professionalName: personName(entry.user)
      }));
    }
    if (!controller.signal.aborted && entry.account === auth.currentUser) publish(entry, {
      ...entry.state,
      directory: contacts,
      directoryError: false
    });
  } catch {
    if (!controller.signal.aborted) publish(entry, {
      ...entry.state,
      directory: [],
      directoryError: true
    });
  }
}
function entryFor(account, user, role, isAdmin, professional, scope) {
  const key = JSON.stringify([account.uid, user.clubId || '', user.linkedClientId || '', role, user.role, isAdmin, professional, scope]);
  let e = entries.get(key);
  if (!e || e.account !== account) {
    e = {
      key,
      account,
      user,
      role,
      isAdmin,
      professional,
      scope,
      listeners: new Set(),
      directoryUsers: 0,
      state: empty,
      delay: 1000
    };
    e.snapshot = () => e.state;
    e.subscribe = fn => {
      entries.set(key, e);
      e.listeners.add(fn);
      if (!e.running) start(e);
      return () => {
        e.listeners.delete(fn);
        queueMicrotask(() => {
          if (!e.listeners.size && entries.get(key) === e) stop(e);
        });
      };
    };
    entries.set(key, e);
  }
  return e;
}
export function useMessagingFeed({
  professional = false,
  scope = '',
  enabled = true,
  compose = false
} = {}) {
  const {
    user,
    effectiveRole,
    isAdmin
  } = useAuth();
  const account = useSyncExternalStore(subscribeAuth, accountNow, () => null);
  const ownerClub = !professional && (user?.role === 'club' || user?.clubRole === 'owner' || user?.accountType === 'club_owner') ? user.clubId : '';
  const entry = enabled && account && user?.uid === account.uid ? entryFor(account, user, effectiveRole, isAdmin, professional, scope || ownerClub || '') : null;
  const state = useSyncExternalStore(entry?.subscribe || noop, entry?.snapshot || emptySnapshot, emptySnapshot);
  useEffect(() => {
    if (!compose || !entry) return;
    if (++entry.directoryUsers === 1) directory(entry);
    return () => {
      if (--entry.directoryUsers === 0) {
        entry.directoryController?.abort();
        publish(entry, {
          ...entry.state,
          directory: [],
          directoryError: false
        });
      }
    };
  }, [compose, entry]);
  return {
    ...state,
    scopeKey: entry?.key || '',
    retry: () => {
      if (entry) {
        entry.controller?.abort();
        if (!entry.running) start(entry);
        if (compose) directory(entry);
      }
    }
  };
}
export function useMessagingIdentity() {
  const {
    user,
    effectiveRole
  } = useAuth();
  const account = useSyncExternalStore(subscribeAuth, accountNow, () => null);
  return account && account.uid === user?.uid ? JSON.stringify([account.uid, user.clubId, effectiveRole, user.linkedClientId]) : null;
}
