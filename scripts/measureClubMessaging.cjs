// Authenticated synthetic scenarios against the dedicated Lot 1 loopback emulators.
const {
  fixture,
  prepareAuth,
  historicalBackend,
  db,
  metrics,
  projectId,
  accounts
} = require('./measureFirebaseLot1.cjs');
const {
  browserPages
} = require('./measureFirebaseBrowser.cjs');
const express = require('../backend/node_modules/express');
const admin = require('../backend/firebaseAdmin');
const {
  randomUUID
} = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const tokens = {};
async function setup() {
  await prepareAuth();
  const email = 'member0@fixture.invalid',
    password = randomUUID();
  try {
    await admin.auth().createUser({
      uid: 'member0',
      email,
      password,
      emailVerified: true
    });
  } catch (e) {
    if (e.code !== 'auth/uid-already-exists') throw e;
    await admin.auth().updateUser('member0', {
      password
    });
  }
  accounts.member0 = {
    email,
    password
  };
  for (const [uid, account] of Object.entries(accounts)) {
    const res = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...account,
        returnSecureToken: true
      })
    });
    assert.equal(res.status, 200);
    tokens[uid] = (await res.json()).idToken;
  }
}
function appFor(folder) {
  const app = express();
  app.use(metrics.httpMetrics);
  app.use(express.json());
  app.use('/api/messaging', require(path.join(folder, 'routes/messaging')));
  return app;
}
async function scenarioTests() {
  await fixture();
  await db.doc('users/member0').set({
    role: 'particulier',
    linkedClientId: 'c0'
  });
  const server = appFor(path.join(root, 'backend')).listen(0, '127.0.0.1');
  await require('node:events').once(server, 'listening');
  async function request(uid, route, body, status = 200) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/messaging/' + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + tokens[uid],
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    assert.equal(response.status, status, route);
    return response.json();
  }
  const target = {
      clubId: 'sample',
      kind: 'client',
      targetId: 'c0'
    },
    qs = new URLSearchParams(target);
  const send = (uid, text, id = randomUUID()) => request(uid, 'club/send', {
    ...target,
    text,
    requestId: id
  }, 201);
  const messages = (uid, suffix = '') => request(uid, 'club/messages?' + qs + '&receipt=visible' + suffix);
  const inbox = uid => request(uid, 'club/inbox');
  const read = (uid, m) => request(uid, 'club/read', {
    ...target,
    messageId: m.id,
    watermark: m.watermark
  });
  try {
    const empty = await inbox('member0');
    assert.equal(empty.unreadCount, 0);
    const pending = request('member0', 'club/inbox?since=' + empty.version);
    const key = randomUUID(),
      first = await send('owner', 'first', key);
    assert.equal((await send('owner', 'first', key)).message.id, first.message.id);
    const received = await pending;
    assert.equal(received.unreadCount, 1);
    await Promise.all([send('owner', 'second'), send('owner', 'third')]);
    const page = await messages('member0');
    assert.equal(page.messages.length, 3);
    await read('member0', page.messages[0]);
    assert.equal((await inbox('member0')).unreadCount, 1);
    await send('member0', 'reply while unread');
    assert.equal((await inbox('member0')).unreadCount, 1);
    assert.equal((await inbox('owner')).unreadCount, 1);
    await read('member0', page.messages.at(-1));
    await read('member0', page.messages[0]);
    assert.equal((await inbox('member0')).unreadCount, 0);
    // Existing history without a delta timestamp stays pageable.
    const ref = db.collection('clubConversations').doc(received.contacts[0].id);
    const batch = db.batch();
    for (let n = 0; n < 60; n++) batch.set(ref.collection('messages').doc('old' + n), {
      text: 'old',
      side: 'club',
      createdAtIso: new Date(100000 + n).toISOString()
    });
    await batch.commit();
    const newest = await messages('member0'),
      older = await messages('member0', '&before=' + newest.cursor);
    assert.equal(newest.messages.length, 50);
    assert.equal(older.messages.length, 14);
    assert.equal(new Set([...newest.messages, ...older.messages].map(m => m.id)).size, 64);
    const burst = db.batch(),
      stamp = admin.firestore.FieldValue.serverTimestamp();
    for (let n = 0; n < 63; n++) burst.set(ref.collection('messages').doc('gap' + n), {
      text: 'gap',
      side: 'club',
      createdAtIso: new Date().toISOString(),
      committedAt: stamp
    });
    burst.set(ref, {
      lastSide: 'club',
      lastIdBySide: {
        club: 'gap9'
      },
      lastBySide: {
        club: stamp
      },
      lastMessageAt: stamp
    }, {
      merge: true
    });
    await burst.commit();
    const delta = await messages('member0', '&after=' + newest.after);
    const rest = await messages('member0', '&after=' + delta.after + '&afterId=' + delta.afterId);
    assert.equal(delta.messages.length, 50);
    assert.equal(rest.messages.length, 13);
    assert.equal(new Set([...delta.messages, ...rest.messages].map(m => m.id)).size, 63);
    await read('member0', delta.messages[0]);
    assert.equal((await inbox('member0')).unreadCount, 1);
    await request('member0', 'club/messages?' + qs);
    await request('member0', 'club/read', target);
    await read('member0', rest.messages.at(-1));
    assert.equal((await inbox('member0')).unreadCount, 0);
    await request('administrator', 'club/messages?' + qs);
    await request('administrator', 'club/send', {
      ...target,
      text: 'forbidden',
      requestId: randomUUID()
    }, 403);
    await request('coach', 'club/messages?' + qs, undefined, 403);
    const waitingScope = await inbox('owner');
    const revoked = request('owner', 'club/inbox?clubId=sample&since=' + waitingScope.version, undefined, 403);
    await new Promise(resolve => setTimeout(resolve, 250));
    await db.doc('clubs/other').set({
      name: 'Other fixture'
    });
    await db.doc('users/owner').update({
      clubId: 'other'
    });
    assert.equal((await request('owner', 'club/inbox?clubId=other')).contacts.length, 0);
    await revoked;
    await request('owner', 'club/messages?' + qs, undefined, 403);
    await db.doc('users/owner').update({
      clubId: 'sample'
    });
    await db.doc('clients/c0').update({
      clubId: 'other'
    });
    assert.equal((await inbox('member0')).contacts.length, 0);
    await request('member0', 'club/messages?' + qs, undefined, 403);
    await request('owner', 'club/send', {
      ...target,
      text: 'forbidden',
      requestId: randomUUID()
    }, 403);
    await db.doc('clients/c0').update({
      clubId: 'sample',
      authUid: 'coach'
    });
    await request('coach', 'club/messages?' + qs, undefined, 403);
    await db.doc('clients/c0').update({
      authUid: 'member0'
    });
    // Professional pair: the HTTP inbox and the existing thread use the same canonical messages.
    const pro = {
      clientUid: 'member0',
      professionalUid: 'coach',
      clientId: 'c0',
      text: 'professional',
      requestId: randomUUID()
    };
    const firstPro = await request('coach', 'send', pro, 201);
    assert.equal((await request('coach', 'send', pro, 201)).message.id, firstPro.message.id);
    const active = await request('member0', 'inbox');
    assert.equal(active.contacts[0].unread, true);
    const proMsg = await db.doc('conversations/c0__coach/messages/' + firstPro.message.id).get();
    const time = proMsg.data().createdAt;
    await request('member0', 'read', {
      conversationId: 'c0__coach',
      messageId: firstPro.message.id,
      watermark: [time.seconds, time.nanoseconds].join(':')
    });
    assert.equal((await request('member0', 'inbox')).contacts[0].unread, false);
    await db.doc('users/coach').update({role:'particulier',hasActiveSubscription:false,subscriptionStatus:'expired'});
    await request('coach','send',{...pro,requestId:randomUUID()},403);
    assert.equal((await request('coach','inbox')).contacts.length,0);
    console.log('PASS concurrent sends, idempotency, partial and monotone read, 2-way unread, legacy pagination, 63 tied commits, preview, revocation, relinking, professional receipt');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
async function runBrowser(before, width, temporary) {
  // Let the last API-only subscriber detach before measuring a cold browser.
  await new Promise(resolve=>setTimeout(resolve,2100));
  await fixture();
  await db.doc('users/member0').set({
    role: 'particulier',
    linkedClientId: 'c0'
  });
  const revision = before ? '4b1d084' : null;
  const dir = path.join(temporary, (before ? 'before' : 'after') + width);
  fs.mkdirSync(dir);
  const folder = revision ? historicalBackend(revision, dir) : path.join(root, 'backend');
  const rows = [],
    info = console.info;
  console.info = (label, data) => {
    if (label !== '[byl-metrics]') return info(label, data);
    const row = JSON.parse(data);
    if (row.scope.endsWith('-watch')) {
      rows.push({
        activity: row.scope,
        httpRequests: 0,
        sdkReads: Number(row.initial),
        documentsReturned: row.initial ? row.documentsReturned : row.changes,
        estimatedDocumentReads: row.initial ? Math.max(1, row.documentsReturned) : row.changes
      });
    } else rows.push(row);
  };
  try {
    const browser = await browserPages({
      directory: revision ? path.dirname(folder) : dir,
      revision,
      app: appFor(folder),
      rows,
      projectId,
      accounts,
      messagingScenario: {
        before,
        width,
        activeOnly:process.env.BYL_MSG_ACTIVE_ONLY==='1'
      },
      revokeMessagingAccess: () => db.doc('users/owner').update({
        clubId: 'other'
      })
    });
    console.log(JSON.stringify({
      before,
      width,
      browser
    }));
    if (!before && process.env.BYL_MSG_ACTIVE_ONLY!=='1') {
      for (const window of ['oneTab22s', 'twoTabs22s', 'badgeBubblePagePanel']) {
        const counter = browser[window].http;
        assert.equal(counter['club-contacts'], undefined);
        assert.equal(counter['club-directory'], undefined);
        assert.equal(counter['club-messages'], undefined);
        for(const scope of ['club-watch','professional-watch']) {
          const starts=counter[scope]?.reads || 0;
          // A watch already open before the window incurs no new subscription.
          assert.ok(starts<=1, 'duplicate listener: '+scope);
          if(window==='twoTabs22s') assert.equal(starts,1);
        }
      }
      assert.equal(browser.explicitDirectory.http['club-directory'].http,1);
      assert.equal(browser.twoTabsConverged, true);
    }
  } finally {
    console.info = info;
  }
}
(async () => {
  await setup();
  await scenarioTests();
  if (process.env.BYL_MSG_API_ONLY === '1') {
    await new Promise(r => setTimeout(r, 1800));
    await db.terminate();
    return;
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'byl-messaging-'));
  try {
    for (const [before, width] of [[true, 1440], [false, 1440], [false, 500]]) {
      if(process.env.BYL_MSG_ACTIVE_ONLY==='1' && width!==1440) continue;
      if (process.env.BYL_MSG_CASE && ![(before ? 'before' : 'after') + width, before ? 'before' : 'after'].includes(process.env.BYL_MSG_CASE)) continue;
      await runBrowser(before, width, temp);
    }
  } finally {
    fs.rmSync(temp, {
      force: true,
      recursive: true
    });
    await new Promise(r => setTimeout(r, 1800));
    await db.terminate();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
