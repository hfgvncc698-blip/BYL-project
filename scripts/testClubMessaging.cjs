const assert = require('node:assert/strict');
const fs = require('node:fs');
const actualAdmin = require('../backend/firebaseAdmin');
assert.equal(typeof actualAdmin.firestore.FieldPath.documentId, 'function');
assert.ok(actualAdmin.firestore.FieldPath.documentId());
const vm = require('node:vm');
const { createClubMessaging, idFor } = require('../backend/utils/clubMessaging');
const records = new Map(Object.entries({
  'clubs/a': { name: 'Club A' }, 'clubs/b': { name: 'Club B' },
  'users/owner': { clubId: 'a', role: 'coach', accountType: 'club_owner' },
  'users/otherOwner': { clubId: 'b', role: 'coach', clubRole: 'owner' },
  'users/coach': { clubId: 'a', role: 'coach', firstName: 'Coach' },
  'users/removed': { clubId: 'a', role: 'coach' },
  'clubs/a/members/removed': { status: 'deleted' },
  'clients/c': { clubId: 'a', authUid: 'client', firstName: 'Client' },
  'clients/unlinked': { clubId: 'a', firstName: 'Offline' },
  'conversations/c__coach': { lastMessage: 'PRIVATE COACH CLIENT' },
}));
const accessed = [];
const snap = path => ({ id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path) });
function ref(path, filters = [], sort = null, start = '', count = Infinity) {
  return {
    path, id: path.split('/').at(-1),
    collection: key => ref(`${path}/${key}`), doc: key => ref(`${path}/${key}`),
    where: (key, op, value) => ref(path, [...filters, [key, op, value]], sort, start, count),
    limit: n => ref(path, filters, sort, start, n), orderBy: () => ref(path, filters, true, start, count), startAfter: value => ref(path, filters, sort, value.id || value, count),
    get: async () => {
      accessed.push(path);
      if (path.split('/').length % 2 === 0) return snap(path);
      let paths = [...records.keys()].filter(k => k.startsWith(`${path}/`) && k.split('/').length === path.split('/').length + 1);
      paths = paths.filter(k => filters.every(([key, op, value]) => op === 'array-contains' ? records.get(k)[key]?.includes(value) : records.get(k)[key] === value));
      if (sort) paths.sort().reverse();
      if (start) paths = paths.filter(k => k.split('/').at(-1) < start);
      const docs = paths.slice(0, count).map(snap); return { docs, size: docs.length };
    },
    set: async (value, options) => records.set(path, options?.merge ? { ...records.get(path), ...value } : value),
  };
}
const db = { collection: path => ref(path), runTransaction: async callback => callback({ get: r => r.get(), set: (r, value, options) => r.set(value, options) }) };
(async () => {
  const service = createClubMessaging(db);
  const info = await service.contacts('owner', 'a');
  assert.deepEqual(info.contacts.map(c => c.targetId).sort(), ['c', 'coach', 'unlinked']);
  assert.equal((await service.contacts('client')).contacts[0].title, 'Club A');
  assert.equal((await service.contacts('coach')).contacts[0].kind, 'coach');
  for (const uid of ['stranger', 'otherOwner', 'removed', 'coach']) await assert.rejects(service.authorize(uid, 'a', 'client', 'c'));
  await assert.rejects(service.contacts('otherOwner', 'a'));
  await assert.rejects(service.authorize('owner', 'a', 'client', 'unlinked'));
  assert.equal((await service.authorize('client', 'a', 'client', 'c')).side, 'member');
  assert.equal((await service.authorize('owner', 'a', 'coach', 'coach')).side, 'club');
  const handlers = []; const router = { use: h => handlers.push({ method: 'USE', h }), get: (path, h) => handlers.push({ method: 'GET', path, h }), post: (path, h) => handlers.push({ method: 'POST', path, h }) };
  const firestore = () => db;
  firestore.FieldPath = { documentId: () => '__name__' };
  firestore.FieldValue = { serverTimestamp: () => ({ toMillis: () => Date.now() }) };
  const context = { require: name => name === 'express' ? { Router: () => router } : name === '../firebaseAdmin' ? { firestore } : name === '../utils/firebaseAuth' ? { requireFirebaseAuth: (req, res, next) => next(), getUserRole: async uid => uid === 'admin' ? 'admin' : 'coach' } : require('../backend/utils/clubMessaging'), module: { exports: {} }, console };
  vm.runInNewContext(fs.readFileSync('backend/routes/clubMessaging.js', 'utf8'), context);
  async function request(uid, method, path, input) {
    const req = { method, auth: { uid, token: { email_verified: true } }, body: method === 'POST' ? input : {}, query: method === 'GET' ? input : {} };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; this.done = true; return this; } };
    for (const entry of handlers) {
      if (res.done) break;
      if (entry.method === 'USE' || entry.method === method && entry.path === path) await entry.h(req, res, () => {});
    }
    return res;
  }
  const payload = { clubId: 'a', kind: 'client', targetId: 'c', text: 'Hello', requestId: '12345678-1234-1234-1234-123456789012' };
  assert.equal((await request('owner', 'POST', '/send', payload)).code, 201);
  assert.equal((await request('owner', 'POST', '/send', payload)).code, 201);
  assert.equal([...records.keys()].filter(k => k.includes('/messages/')).length, 1, 'retry does not duplicate messages');
  assert.equal((await request('client', 'GET', '/messages', payload)).data.messages.length, 1);
  const threadPath = `clubConversations/${idFor('a', 'client', 'c')}/messages`;
  for (let index = 0; index < 55; index += 1) {
    const id = `1000000000000_${String(index).padStart(3, '0')}`;
    records.set(`${threadPath}/${id}`, { id, createdAtIso: new Date(1000000000000 + index).toISOString(), text: 'fixture' });
  }
  const firstPage = (await request('client', 'GET', '/messages', payload)).data;
  const secondPage = (await request('client', 'GET', '/messages', { ...payload, before: firstPage.cursor })).data;
  assert.equal(firstPage.messages.length, 50);
  assert.equal(firstPage.more, true);
  assert.equal(secondPage.messages.length, 6);
  assert.equal(secondPage.more, false);
  assert.equal(new Set([...firstPage.messages, ...secondPage.messages].map(row => row.id)).size, 56);
  assert.equal((await request('client', 'GET', '/messages', { ...payload, before: 'missing' })).code, 400);
  assert.equal((await request('coach', 'GET', '/messages', payload)).code, 403);
  assert.equal((await request('otherOwner', 'POST', '/send', payload)).code, 403);
  assert.equal((await request('admin', 'POST', '/send', payload)).code, 403, 'admin preview cannot impersonate a club');
  assert.equal((await request('admin', 'GET', '/messages', payload)).code, 200);
  records.set('clubs/a/appointments/course', {type:'group'});
  records.set('clubs/b/appointments/foreign', {type:'group'});
  const classPayload = {...payload, requestId:'22345678-1234-1234-1234-123456789012', classRequest:{classId:'course'}};
  assert.equal((await request('owner', 'POST', '/send', classPayload)).code, 400);
  assert.equal((await request('client', 'POST', '/send', {...classPayload, classRequest:{classId:'foreign'}})).code, 400);
  const linked = await request('client', 'POST', '/send', classPayload);
  assert.equal(linked.code, 201);
  assert.equal(linked.data.message.classRequest.classId, 'course');
  assert.equal((await request('client', 'POST', '/send', classPayload)).data.message.id, linked.data.message.id);
  records.set('clients/c', { clubId: 'b', authUid: 'client' });
  assert.equal((await request('owner', 'GET', '/messages', payload)).code, 403, 'membership revocation denies historical access');
  records.set('clients/c', { clubId: 'a', authUid: 'newClient' });
  assert.equal((await request('newClient', 'GET', '/messages', payload)).code, 403, 'relinked account cannot inherit private history');
  const relinkedDirectory = await request('owner', 'GET', '/contacts', { clubId: 'a' });
  assert.equal(relinkedDirectory.data.contacts.find(c => c.targetId === 'c').lastMessage, '', 'new account does not inherit the previous message preview');
  assert.ok(!accessed.some(path => path.startsWith('conversations/')), 'club endpoints never read coach-client conversations');
  assert.notEqual(idFor('a', 'client', 'c'), idFor('b', 'client', 'c'));
  console.log('Club messaging: owner/coach/client, isolation, removal, account relinking, read-only admin preview and idempotent sending passed. No real messages sent.');
})();
