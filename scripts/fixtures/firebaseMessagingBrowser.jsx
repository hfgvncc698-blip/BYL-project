import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';
import { setPersistence, inMemoryPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from './src/firebaseConfig';
import './src/i18n/index';
import DashboardMessagingBubble from './src/components/messaging/DashboardMessagingBubble';
import ClubMessagingPanel, { ClubThread } from './src/components/messaging/ClubMessagingPanel';
import useClubUnreadCount from './src/components/messaging/useClubUnreadCount';
import { api } from './src/components/messaging/clubMessagingApi';
import useMemberClubContacts from './src/components/messaging/useMemberClubContacts';
import MessagingPage from './src/pages/MessagingPage';
import { useTranslation } from 'react-i18next';
const scenario = globalThis.messagingScenario,
  result = {};
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (v, msg) => {
  if (!v) throw Error(msg);
};
async function until(test, label, ms = 12000) {
  const started = performance.now();
  while (!test()) {
    assert(performance.now() - started < ms, label);
    await wait(35);
  }
}
async function login(uid) {
  await setPersistence(auth, inMemoryPersistence);
  const a = await (await fetch('/fixture-' + uid)).json();
  await signInWithEmailAndPassword(auth, a.email, a.password);
  window.fixtureOwner = uid === 'owner';
  window.fixtureMember = uid === 'member0';
}
let root;
function Badge() {
  const n = useClubUnreadCount('sample');
  return <output data-testid="badge">{n}</output>;
}
function Latest() {
  const feed=useMemberClubContacts({includeOwners:true});
  return <output data-testid="latest">{feed.contacts[0]?.lastMessage}</output>;
}
function Thread() {
  const {
    t
  } = useTranslation();
  const peer = useMemberClubContacts({
    includeOwners: true
  }).contacts[0];
  return peer ? <div style={{
    height: 450
  }}><ClubThread contact={peer} ownerView={window.fixtureOwner} preview={false} t={t} onBack={() => {}} /></div> : null;
}
function mount(mode) {
  if (!root) root = createRoot(document.getElementById('root'));
  root.render(<ChakraProvider><MemoryRouter initialEntries={[mode === 'page' ? '/messages' : '/club-dashboard']}>
    {window.fixtureOwner && <Badge />}<DashboardMessagingBubble notificationsOnly />
    {(mode === 'panel' || mode === 'combined') && <ClubMessagingPanel embedded clubId="sample" />}
    {(mode === 'page' || mode === 'combined') && <MessagingPage />}
    {mode === 'thread' && <Thread />}
    {mode === 'observe' && <Latest />}
  </MemoryRouter></ChakraProvider>);
}
async function unmount() {
  root?.unmount();
  root = null;
  await wait(1800);
}
async function start() {
  await fetch('/fixture-start');
  window.bylFirestoreMetrics.reset();
}
async function stop(key) {
  result[key] = {
    http: await (await fetch('/fixture-stop')).json(),
    browser: window.bylFirestoreMetrics.snapshot().counters,
    width: innerWidth
  };
}
const target = {
  clubId: 'sample',
  kind: 'client',
  targetId: 'c0'
};
async function send(text) {
  return api('send', {
    ...target,
    text,
    requestId: crypto.randomUUID()
  });
}
window.peerStart = (mode='idle') => mount(mode);
window.observedToasts=new Set();
new MutationObserver(()=>{
  for(const toast of document.querySelectorAll('[id^="toast-message-"]')){
    if(!toast.id.endsWith('-title') && !toast.id.endsWith('-description')) window.observedToasts.add(toast.id);
  }
}).observe(document.body,{childList:true,subtree:true});
window.peerStop = unmount;
window.peerSend = send;
window.threadStart = () => mount('thread');
window.sendProfessional = text => api('send', {
  clientUid: 'member0',
  professionalUid: 'coach',
  clientId: 'c0',
  text,
  requestId: crypto.randomUUID()
}, null, auth.currentUser, true);
window.startPage = () => mount('page');
window.confirmNewest = async () => {
  const result = await api('messages?' + new URLSearchParams(target));
  const last = result.messages.at(-1);
  await api('read', {
    ...target,
    messageId: last.id,
    watermark: last.watermark
  });
};
async function openPeer(uid) {
  const peer = window.open('/?peer=' + uid, '_blank');
  await until(() => peer?.ready, 'peer-start', 30000);
  return peer;
}
// Identical active window on both revisions. Include sends, authorization, thread and receipts.
async function measureExchange(){
  const member=await openPeer('member0');
  await start();mount('idle');await wait(1400);
  const first=performance.now();
  await member.peerSend('closed fixture');
  await until(()=>document.querySelector('[data-testid=badge]')?.textContent==='1','closed-badge',30000);
  result.closedBadgeMs=Math.round(performance.now()-first);
  member.close();
  const openAt=performance.now();mount('thread');
  await until(()=>document.body.textContent.includes('closed fixture'),'thread-load');
  result.threadDisplayMs=Math.round(performance.now()-openAt);
  window.focus();
  await until(()=>document.querySelector('[data-testid=badge]')?.textContent==='0','visible-read',30000);
  const sender=await openPeer('member0');
  const next=performance.now();await sender.peerSend('opened fixture');sender.close();
  await until(()=>document.body.textContent.includes('opened fixture'),'open-delivery',30000);
  result.openDeliveryMs=Math.round(performance.now()-next);
  await until(()=>document.querySelector('[data-testid=badge]')?.textContent==='0','read-confirmation',30000);
  result.openReadMs=Math.round(performance.now()-next);
  // Allow outstanding receipt requests to finish on both implementations.
  await wait(800);
  await unmount();
  await stop('receiveAndRead');
}
(async () => {
  const peerUid = new URLSearchParams(location.search).get('peer');
  await login(peerUid || 'owner');
  if (peerUid) {
    window.ready = true;
    return;
  }
  if(scenario.activeOnly){
    await measureExchange();
    await fetch('/fixture-results',{method:'POST',body:JSON.stringify(result)});
    return;
  }
  await start();
  mount('idle');
  await wait(22000);
  await unmount();
  await stop('oneTab22s');
  if (scenario.width === 1440) {
    await start();
    mount('idle');
    await wait(62000);
    await unmount();
    await stop('oneTab62s');
  }
  const second = await openPeer('owner');
  await start();
  mount('idle');
  second.peerStart();
  await wait(22000);
  await Promise.all([unmount(), second.peerStop()]);
  second.close();
  await stop('twoTabs22s');
  if (scenario.before) {
    await measureExchange();
  } else {
    await start();
    mount('combined');
    await wait(1400);
    await unmount();
    await stop('badgeBubblePagePanel');
    mount('panel');
    const composeButton=()=>document.querySelector('button[aria-pressed="false"]');
    await until(composeButton,'compose-button');
    await start();composeButton().click();
    await until(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('(12)')),'compose-directory');
    await stop('explicitDirectory');await unmount();
    await measureExchange();
    mount('thread');await until(()=>document.querySelector('[data-message-id]'),'reopen-before-disconnect');
    const onlineFetch = window.fetch;
    window.fetch = (input, ...args) => String(input).includes('/api/messaging') ? Promise.reject(new TypeError('offline fixture')) : onlineFetch(input, ...args);
    window.dispatchEvent(new Event('offline'));
    await until(() => !document.querySelector('[data-message-id]'), 'offline-thread');
    const reconnectActor = await openPeer('member0');
    await reconnectActor.peerSend('missed fixture');
    reconnectActor.close();
    window.fetch = onlineFetch;
    window.dispatchEvent(new Event('online'));
    await until(() => document.body.textContent.includes('missed fixture'), 'reconnect-gap');
    const transport = window.fetch;
    let release,
      held = false;
    window.fetch = async (...args) => {
      const response = await transport(...args);
      if (String(args[0]).includes('lateFixture=1')) {
        held = true;
        await new Promise(resolve => {
          release = resolve;
        });
      }
      return response;
    };
    const oldCall = api('messages?' + new URLSearchParams(target) + '&lateFixture=1').then(() => false, () => true);
    await until(() => held, 'pending-old-account');
    await signOut(auth);
    await until(() => !document.querySelector('[data-message-id]'), 'logout-clears-thread');
    await login('member0');
    mount('page');
    release();
    window.fetch = transport;
    assert(await oldCall, 'accepted-old-response');
    await until(() => document.body.textContent.includes('missed fixture'), 'member-account');
    const coach = await openPeer('coach');
    coach.startPage();
    await coach.sendProfessional('coach to client fixture');
    await until(() => document.body.textContent.includes('coach to client fixture'), 'professional-client-delivery');
    const item = [...document.querySelectorAll('button')].find(b => b.textContent.includes('coach to client fixture'));
    assert(item, 'professional-conversation-button');
    item.click();
    await until(() => [...document.querySelectorAll('[data-message-id]')].some(node => node.textContent.includes('coach to client fixture')), 'open-professional-history');
    await coach.sendProfessional('open professional fixture');
    await until(() => [...document.querySelectorAll('[data-message-id]')].some(node => node.textContent.includes('open professional fixture')), 'open-professional-live');
    await window.sendProfessional('client to coach fixture');
    await until(() => coach.document.body.textContent.includes('client to coach fixture'), 'professional-coach-delivery');
    coach.close();
    await unmount();
    await signOut(auth);
    await login('owner');
    mount('observe');
    const otherOwner = await openPeer('owner');
    otherOwner.peerStart('observe');
    const writer = await openPeer('member0');
    window.observedToasts.clear();otherOwner.observedToasts.clear();
    await writer.peerSend('both tabs fixture');
    writer.close();
    const badgeIn = w => w.document.querySelector('[data-testid=badge]')?.textContent;
    await until(() => badgeIn(window) === '1' && badgeIn(otherOwner) === '1', 'both tabs received');
    await until(()=>[window,otherOwner].every(w=>w.document.querySelector('[data-testid=latest]')?.textContent==='both tabs fixture'),'both tabs latest');
    await until(()=>window.observedToasts.size+otherOwner.observedToasts.size>=1,'new message toast');
    await otherOwner.confirmNewest();
    await until(() => badgeIn(window) === '0' && badgeIn(otherOwner) === '0', 'both tabs read');
    result.visibleToasts=window.observedToasts.size+otherOwner.observedToasts.size;
    assert(result.visibleToasts===1,'duplicate toast');
    otherOwner.close();
    result.twoTabsConverged = true;
    mount('thread');
    await until(() => document.body.textContent.includes('both tabs fixture'), 'thread-before-revocation');
    const tick = performance.now();
    assert((await fetch('/fixture-revoke', {
      method: 'POST'
    })).ok, 'revoke-fixture');
    await until(() => !document.querySelector('[data-message-id]'), 'revoked-thread', 35000);
    result.revocationMs = Math.round(performance.now() - tick);
    await unmount();
  }
  await fetch('/fixture-results', {
    method: 'POST',
    body: JSON.stringify(result)
  });
})().catch(error => fetch('/fixture-results', {
  method: 'POST',
  body: JSON.stringify({
    failure: error.message
  })
}));
