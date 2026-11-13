import { localSessionStorage, tabSessionStorage } from "../../utils/privateStorage.js";
import { useSyncExternalStore } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { useAuth } from '../../AuthContext';
import { recordMetric } from '../../utils/browserMetrics';
import { apiFetch } from '../../utils/api';

// One confirmed snapshot per authenticated principal, role and projection in this tab.
const maxAge = 120_000;
const empty = { contracts: [], checks: {}, version: 0, loading: true, error: '' };
const entries = new Map();
const authSubscribers = new Set();
let observing = false;
let channel;
const storageSignal = 'byl:coach-offers:invalidate';
const unavailable = 'Données indisponibles. Actualisez la page.';

function publish(entry, state) {
  entry.state = state;
  entry.listeners.forEach(notify => notify());
}

function valid(entry) {
  return entries.get(entry.key) === entry && entry.account === auth.currentUser;
}

function ensureObservers() {
  if (observing) return;
  observing = true;
  onAuthStateChanged(auth, account => {
    for (const entry of entries.values()) {
      if (entry.account !== account) {
        entries.delete(entry.key);
        clearTimeout(entry.timer);
        publish(entry, empty);
      }
    }
    authSubscribers.forEach(fn => fn());
  });
  if (typeof BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel('byl-coach-offers');
      channel.onmessage = ({ data }) => receiveSignal(data);
    } catch { /* Storage events can still signal another tab. */ }
  }
  window.addEventListener('storage', event => {
    if (event.key !== storageSignal || !event.newValue) return;
    try { receiveSignal(JSON.parse(event.newValue)); } catch { /* Ignore malformed signals. */ }
  });
  window.addEventListener('online', refreshActive);
  window.addEventListener('focus', refreshActive);
  window.addEventListener('cancellation-reviewed', () => offerBookingConfirmed(auth.currentUser?.uid));
  window.addEventListener('offline', () => invalidate(auth.currentUser?.uid));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshActive();
  });
}

function subscribeAuth(notify) {
  authSubscribers.add(notify);
  ensureObservers();
  return () => authSubscribers.delete(notify);
}

function receiveSignal(data) {
  if (data?.uid && data.uid === auth.currentUser?.uid) invalidate(data.uid, data.creditsOnly === true);
}

function notifyOtherTabs(uid, creditsOnly = false) {
  const signal = { uid, creditsOnly };
  try {
    if (channel) channel.postMessage(signal);
    else {
      localSessionStorage.setItem(storageSignal, JSON.stringify(signal));
      localSessionStorage.removeItem(storageSignal);
    }
  } catch { /* Isolated tabs revalidate on focus, reconnect or expiry. */ }
}

function refreshActive() {
  for (const entry of entries.values()) {
    if (entry.listeners.size) invalidateEntry(entry);
  }
}

function invalidate(uid, creditsOnly = false, relevant) {
  for (const entry of entries.values()) {
    if (entry.account.uid !== uid) continue;
    // The full history also includes sessions outside a contract.
    if (creditsOnly && entry.summary && entry.confirmed && !entry.pending) {
      const contracts = entry.confirmed.contracts;
      if (!contracts.length) continue;
      if (relevant && !contracts.some(relevant)) continue;
    }
    invalidateEntry(entry);
  }
}

export function invalidateOfferCredits(uid, changes) {
  const relevant = changes && (contract => changes.some(({ doc }) => {
    const session = doc.data();
    return contract.clientId === (session.clientDocId || session.clientId)
      || contract.history?.some(event => event.id === doc.id);
  }));
  invalidate(uid, true, relevant);
}

export function offerBookingConfirmed(uid, ...clientIds) {
  if (!uid || uid !== auth.currentUser?.uid) return;
  invalidate(uid, true, clientIds.some(Boolean) ? c => clientIds.includes(c.clientId) : undefined);
  notifyOtherTabs(uid, true);
}

function invalidateEntry(entry) {
  entry.generation++;
  entry.expires = 0;
  clearTimeout(entry.timer);
  if (entry.listeners.size && !entry.queued) {
    entry.queued = true;
    setTimeout(() => {
      entry.queued = false;
      if (entry.listeners.size && valid(entry)) load(entry);
    }, 50);
  }
}

function schedule(entry, delay) {
  clearTimeout(entry.timer);
  if (!entry.listeners.size || !valid(entry)) return;
  entry.timer = setTimeout(() => {
    if (!document.hidden) invalidateEntry(entry);
  }, Math.max(0, delay));
}

async function request(entry, options) {
  if (!valid(entry)) throw Error(unavailable);
  const token = await entry.account.getIdToken();
  if (!valid(entry)) throw Error(unavailable);
  return apiFetch(entry.summary ? '/coach-offers?view=summary' : '/coach-offers', {
    cache: 'no-cache', ...options, headers: { Authorization: 'Bearer ' + token },
  });
}

function accept(entry, data) {
  if (!valid(entry)) return;
  if (!data.offers) {
    try {
      const saved = JSON.parse(tabSessionStorage.getItem('byl-offer-preview-v2:' + entry.account.uid));
      if (saved?.offers) data = { ...data, offers: saved.offers };
    } catch { /* Optional local catalogue. */ }
  }
  entry.confirmed = { ...empty, ...data, checks: data.checks || {}, verifiedAt: Date.now(), loading: false, error: '' };
  entry.expires = Date.now() + maxAge;
  publish(entry, entry.confirmed);
  schedule(entry, maxAge);
}

function load(entry) {
  if (!valid(entry) || entry.pending) return;
  if (entry.expires > Date.now()) {
    recordMetric('offers', 'cache-hit');
    schedule(entry, entry.expires - Date.now());
    return;
  }
  if (!navigator.onLine) {
    publish(entry, { ...empty, loading: false, error: unavailable });
    return;
  }
  const generation = entry.generation;
  entry.pending = true;
  publish(entry, empty);
  const started = performance.now();
  recordMetric('offers', 'refresh');
  request(entry).then(result => {
    if (generation === entry.generation && valid(entry)) {
      recordMetric('offers', 'ready', { durationMs: performance.now() - started });
      accept(entry, result);
    }
  }).catch(error => {
    if (!valid(entry) || generation !== entry.generation) return;
    entry.confirmed = null;
    publish(entry, { ...empty, loading: false, error: error.data?.error || unavailable });
    if (error.status !== 401 && error.status !== 403) schedule(entry, 30_000);
  }).finally(() => {
    entry.pending = false;
    if (valid(entry) && entry.listeners.size && generation !== entry.generation) load(entry);
  });
}

function entryFor(account, role, summary) {
  const key = JSON.stringify([account.uid, role, summary]);
  let entry = entries.get(key);
  if (!entry || entry.account !== account) {
    entry = { key, account, summary, state: empty, listeners: new Set(), expires: 0, generation: 0 };
    entry.subscribe = notify => {
      entry.listeners.add(notify);
      load(entry);
      return () => {
        entry.listeners.delete(notify);
        if (!entry.listeners.size) clearTimeout(entry.timer);
      };
    };
    entry.snapshot = () => entry.state === entry.confirmed && entry.expires <= Date.now() ? empty : entry.state;
    entries.set(key, entry);
  }
  return entry;
}

function commandFor(fn, previous) {
  if (typeof fn !== 'function') return fn;
  const next = fn(previous);
  if (JSON.stringify(next.offers) !== JSON.stringify(previous.offers)) {
    return { action: 'catalogue', offers: next.offers };
  }
  if (next.contracts.length === previous.contracts.length + 1) {
    const contract = next.contracts.at(-1);
    return previous.contracts.some(c => c.id === contract.id) ? null : { action: 'assign', contract };
  }
  const id = Object.keys(next.checks).find(key => JSON.stringify(next.checks[key]) !== JSON.stringify(previous.checks[key]));
  return id ? { action: 'check', id, check: next.checks[id] } : null;
}

const subscribeEmpty = () => () => {};
const getEmpty = () => empty;
const currentAccount = () => auth.currentUser;

function scopedEntry(account, uid, user, effectiveRole, summary) {
  if (!uid || uid !== account?.uid || uid !== user?.uid || user.disabledByClub || (user.role !== 'admin' && user.clubId)) return null;
  return entryFor(account, [user.role, effectiveRole, user.subscriptionStatus, user.hasActiveSubscription, user.clubId, user.emailVerified], summary);
}

// The desktop/tablet card is rendering. Start its authorized data and lazy UI in parallel.
export function warmDashboardOffers(uid, user, effectiveRole) {
  const entry = scopedEntry(auth.currentUser, uid, user, effectiveRole, true);
  if (entry && !entry.pending && entry.expires <= Date.now()) {
    ensureObservers();
    load(entry);
  }
}

export function useOfferPreview(uid, { summary = true } = {}) {
  const { user, effectiveRole } = useAuth();
  const account = useSyncExternalStore(subscribeAuth, currentAccount, () => null);
  const entry = scopedEntry(account, uid, user, effectiveRole, summary);
  const state = useSyncExternalStore(entry?.subscribe || subscribeEmpty, entry?.snapshot || getEmpty, getEmpty);
  async function update(fn) {
    if (!entry || !valid(entry) || state.loading || state.error || state !== entry.confirmed || entry.expires <= Date.now()) throw Error(unavailable);
    const command = commandFor(fn, state);
    if (!command || (command.action === 'assign' && state.contracts.some(c => c.id === command.contract.id))) return;
    try {
      const generation = entry.generation;
      const result = await request(entry, { method: 'POST', body: JSON.stringify({ ...command, version: state.version }) });
      if (!valid(entry)) return;
      const superseded = generation !== entry.generation;
      invalidate(uid);
      if (!superseded && (!entry.confirmed || result.version >= entry.confirmed.version)) accept(entry, result);
      notifyOtherTabs(uid);
    } catch (error) {
      invalidate(uid);
      notifyOtherTabs(uid);
      throw error;
    }
  }
  return [state, update];
}
