import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from './src/firebaseConfig';
import './src/i18n/index.js';
import Coach from './src/components/CoachDashboard';
import { useOfferPreview } from './src/components/offers/OfferPreviewStore';

const scenario = globalThis.offerScenario;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = {};
let firstConfirmation, firstUsable;
window.addEventListener('fixture-offer-confirmed', () => { firstConfirmation ??= performance.now(); });
window.addEventListener('fixture-offer-usable', () => { firstUsable ??= performance.now(); });
const assert = (ok, code) => { if (!ok) throw Error(code); };
async function until(condition, code, timeout = 20000) {
  const start = performance.now();
  while (!condition()) { assert(performance.now() - start < timeout, code); await wait(50); }
}
async function login(actor) {
  const account = await (await fetch('/fixture-' + actor)).json();
  await signInWithEmailAndPassword(auth, account.email, account.password);
}
async function begin() {
  await fetch('/fixture-start');
  window.bylFirestoreMetrics.reset();
  performance.clearResourceTimings();
  firstConfirmation = firstUsable = undefined;
  return performance.now();
}
async function end(name, extra = {}) {
  const offers = performance.getEntriesByType('resource').filter(r => new URL(r.name).pathname === '/api/coach-offers');
  const { counters } = window.bylFirestoreMetrics.snapshot();
  results[name] = { ...extra, http: (await (await fetch('/fixture-stop')).json()).offers || { http: 0, reads: 0, documents: 0, estimate: 0 },
    refresh: counters['offers/refresh']?.calls || 0, joined: counters['offers/joined']?.calls || 0,
    width: innerWidth, firstResponseEnd: offers[0]?.responseEnd ?? null };
}
function mount(element) {
  const root = createRoot(document.getElementById('root'));
  root.render(<ChakraProvider><MemoryRouter initialEntries={['/coach-dashboard?dashboardPerf']}>{element}</MemoryRouter></ChakraProvider>);
  return root;
}
async function dashboard(warm) {
  const started = await begin();
  const root = mount(<Coach />);
  const timing = () => JSON.parse(document.querySelector('[data-testid="coach-dashboard-timing"]')?.textContent || '{}');
  await until(() => timing().core?.status === 'ready', 'dashboard-ready');
  const readyMs = Math.round(performance.now() - started);
  await wait(500);
  const renewalLinks = document.querySelectorAll('details a[href*="tab=clients&client=c0"]').length;
  const paymentLinks = document.querySelectorAll('a[href="/coach/offers?tab=payments"]').length;
  await end(warm ? 'warm' : 'cold', { readyMs, cacheMs: timing().coreCache?.mountMs ?? null, paymentLinks, renewalLinks });
  const r = results[warm ? 'warm' : 'cold'];
  r.offerUsableMs = firstUsable === undefined ? null : Math.round(firstUsable - started);
  r.offerConfirmedMs = firstConfirmation === undefined ? null : Math.round(firstConfirmation - started);
  r.offerResponseMs = r.firstResponseEnd === null ? null : Math.round(r.firstResponseEnd - started);
  if (!scenario.before && scenario.contracts) {
    assert(paymentLinks === (innerWidth >= 768 ? 1 : 0), 'responsive-offer-mount');
    assert(renewalLinks === paymentLinks, 'renewal-alert');
  }
  if (warm && scenario.width === 1440 && !scenario.timingOnly) {
    await begin();
    await wait(62000);
    await end('idle62s');
    await begin();
    await fetch('/fixture-calendar-change', {method:'POST'});
    await wait(3200);
    await end('remoteSession');
    if (scenario.contracts) {
      await begin();
      await fetch('/fixture-calendar-change?unrelated', {method:'POST'});
      await wait(3200);
      await end('unrelatedSession');
      if (!scenario.before) assert(results.unrelatedSession.http.http === 0, 'unrelated-session-requests');
    }
  }
  root.unmount();
  await wait(350);
}
let observed;
let mutate;
function Probe({uid}) {
  const [state, update] = useOfferPreview(uid);
  useEffect(() => { observed = state; mutate = update; }, [state, update]);
  return null;
}
async function peerTab() {
  await login('coach');
  mount(<Probe uid="coach"/>);
  await until(() => observed && !observed.loading && !observed.error, 'peer-first-load');
  window.peerState = () => observed;
  window.opener.postMessage('offers-ready', location.origin);
}
async function interactions() {
  observed = null;
  const root = mount(<Probe uid="coach"/>);
  await until(() => observed?.contracts?.length === 2, 'initial-contracts');
  assert(observed.contracts[0].used === 1, 'remote-credit-consumed');
  const peer = window.open('/?offers-peer', '_blank');
  try {
    await until(() => peer?.peerState, 'peer-open');
    const editing = await begin();
    await mutate({ action:'contract', operation:'update', id:'pack0', quantity:4 });
    await until(() => peer.peerState()?.contracts?.[0]?.quantity === 4, 'peer-contract', 45000);
    await end('twoTabsContract', { syncMs: Math.round(performance.now() - editing) });
    await mutate({ action:'check', id:'pack0:2026-01-01', check:{ status:'paid', paidDate:'2026-01-01' } });
    await until(() => observed?.checks?.['pack0:2026-01-01']?.status === 'paid', 'payment-confirmation');
    assert(observed.contracts[0].available === 3, 'post-mutation-credit');
  } finally { peer?.close(); }
  await fetch('/fixture-offers-offline', {method:'POST'});
  window.dispatchEvent(new Event('focus'));
  await until(() => observed?.error, 'failed-transport-state');
  const offlineContracts = observed.contracts.length;
  if (!scenario.before) assert(offlineContracts === 0, 'stale-balances-cleared');
  Object.defineProperty(navigator, 'onLine', {configurable:true, value:false});
  window.dispatchEvent(new Event('offline'));
  await wait(100);
  delete navigator.onLine;
  await fetch('/fixture-offers-online', {method:'POST'});
  const reconnecting = await begin();
  window.dispatchEvent(new Event('online'));
  await until(() => !observed?.error && observed?.contracts?.[0]?.available === 3, 'reconnect', 45000);
  await end('reconnect', { syncMs: Math.round(performance.now() - reconnecting), offlineContracts });
  await signOut(auth);
  await wait(200);
  const afterLogout = observed?.contracts.length;
  if (!scenario.before) assert(afterLogout === 0, 'logout-cleared');
  await login('administrator');
  window.fixtureAdmin = true;
  root.render(<Probe uid="administrator"/>);
  await until(() => observed && !observed.loading && !observed.error && !observed.contracts.length, 'new-account');
  assert(!Object.keys(observed.checks).length, 'account-isolation');
  results.account = { afterLogout, secondAccountContracts: observed.contracts.length };
  root.unmount();
}
(async () => {
  if (location.search === '?offers-peer') return peerTab();
  await login('coach');
  await dashboard(false);
  await dashboard(true);
  if (scenario.contracts && scenario.width === 1440 && !scenario.timingOnly) await interactions();
  if (!scenario.before && scenario.width === 1440 && !scenario.timingOnly) {
    assert(results.cold.http.http >= 1 && (scenario.contracts || results.cold.http.http === 1), 'cold-request-count');
    assert((scenario.contracts || results.warm.http.http === 0) && results.idle62s.http.http === 0, 'warm-idle-requests');
    if (!scenario.contracts) assert(results.remoteSession.http.http === 0, 'empty-session-requests');
  }
  await fetch('/fixture-results', {method:'POST',body:JSON.stringify(results)});
})().catch(error => fetch('/fixture-results', {method:'POST', body:JSON.stringify({failure: error.message})}));
