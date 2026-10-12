const express = require('express');
const admin = require('../firebaseAdmin');
const { requireFirebaseAuth, getUserRole } = require('../utils/firebaseAuth');
const { createClubMessaging } = require('../utils/clubMessaging');
const router = express.Router();
const db = admin.firestore();
const service = createClubMessaging(db);
const valid = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !value.includes('/');
const previewFor = async req => req.auth.token?.email_verified === true && ['admin', 'super_admin', 'superadmin'].includes(await getUserRole(req.auth.uid));
const fail = (res, error) => {
  if (!error.status) console.error('[club-messaging]', error.message);
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'club-messaging-unavailable' });
};
const refFor = info => db.collection('clubConversations').doc(info.contact.id);
router.use(requireFirebaseAuth);
router.get('/contacts', async (req, res) => {
  try {
    if (req.query.clubId && !valid(req.query.clubId)) return res.status(400).json({ error: 'invalid-club' });
    const info = await service.contacts(req.auth.uid, req.query.clubId, await previewFor(req));
    const contacts = await Promise.all(info.contacts.map(async c => {
      const snap = await db.collection('clubConversations').doc(c.id).get();
      const stored = snap.data() || {};
      const data = stored.peerUid === c.peerUid ? stored : {};
      const side = info.ownerView ? 'club' : 'member';
      return { ...c, unread: !!data.lastMessageAt && data.lastSide !== side && (data.readAt?.[side]?.toMillis?.() || 0) < data.lastMessageAt.toMillis(), lastMessage: data.lastMessage || '', lastMessageAt: data.lastMessageAt?.toMillis?.() || 0 };
    }));
    res.json({ clubId: info.clubId || '', clubName: info.clubName || '', ownerView: info.ownerView, preview: info.preview, contacts });
  } catch (error) { fail(res, error); }
});
router.use(async (req, res, next) => {
  try {
    const input = req.method === 'GET' ? req.query : req.body;
    if (!valid(input.clubId) || !valid(input.targetId) || !['coach', 'client'].includes(input.kind)) return res.status(400).json({ error: 'invalid-conversation' });
    const preview = await previewFor(req);
    req.clubConversation = await service.authorize(req.auth.uid, input.clubId, input.kind, input.targetId, preview);
    req.clubPreview = preview && !req.clubConversation.owners.includes(req.auth.uid) && req.clubConversation.contact.peerUid !== req.auth.uid;
    if (req.method !== 'GET' && req.clubPreview) return res.status(403).json({ error: 'admin-preview-read-only' });
    const existing = await refFor(req.clubConversation).get();
    if (existing.exists && existing.data().peerUid !== req.clubConversation.contact.peerUid) return res.status(403).json({ error: 'conversation-account-changed' });
    next();
  } catch (error) { fail(res, error); }
});
router.get('/messages', async (req, res) => {
  try {
    const ref = refFor(req.clubConversation);
    let query = ref.collection('messages').orderBy('createdAtIso', 'desc');
    if (req.query.before) {
      if (!valid(req.query.before)) return res.status(400).json({ error: 'invalid-cursor' });
      const cursor = await ref.collection('messages').doc(req.query.before).get();
      if (!cursor.exists) return res.status(400).json({ error: 'invalid-cursor' });
      query = query.startAfter(cursor);
    }
    const snap = await query.limit(51).get();
    const docs = snap.docs.slice(0, 50);
    res.json({ messages: docs.map(row => ({ id: row.id, ...row.data() })).reverse(), more: snap.size > 50, cursor: docs.at(-1)?.id || '' });
  } catch (error) { fail(res, error); }
});
router.post('/read', async (req, res) => {
  try {
    const ref = refFor(req.clubConversation);
    if ((await ref.get()).exists) await ref.set({ readAt: { [req.clubConversation.side]: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
    res.json({ ok: true });
  } catch (error) { fail(res, error); }
});
router.post('/send', async (req, res) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const requestId = req.body.requestId;
    if (!text || text.length > 4000 || !/^[a-f0-9-]{36}$/.test(requestId || '')) return res.status(400).json({ error: 'invalid-message' });
    const info = req.clubConversation;
    const ref = refFor(info);
    const receipt = ref.collection('requests').doc(`${req.auth.uid}_${requestId}`);
    const message = await db.runTransaction(async tx => {
      const existing = await tx.get(receipt);
      if (existing.exists) return existing.data().message;
      let classRequest;
      if (req.body.classRequest) {
        const classId = req.body.classRequest.classId;
        if (info.side !== 'member' || info.contact.kind !== 'client' || !valid(classId)) throw Object.assign(new Error('invalid-class-request'), {status:400});
        const course = await tx.get(db.collection('clubs').doc(info.clubId).collection('appointments').doc(classId));
        if (!course.exists || course.data().type !== 'group') throw Object.assign(new Error('invalid-class-request'), {status:400});
        classRequest = {classId};
      }
      const id = `${String(Date.now()).padStart(13, '0')}_${requestId}`;
      const value = { ...(classRequest ? {classRequest} : {}), id, text, senderUid: req.auth.uid, side: info.side, createdAtIso: new Date().toISOString() };
      tx.set(ref.collection('messages').doc(id), value);
      tx.set(receipt, { message: value });
      tx.set(ref, { clubId: info.clubId, kind: info.contact.kind, targetId: info.contact.targetId, peerUid: info.contact.peerUid, lastMessage: text.slice(0, 180), lastSide: info.side, lastMessageAt: admin.firestore.FieldValue.serverTimestamp(), readAt: { [info.side]: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
      return value;
    });
    res.status(201).json({ message });
  } catch (error) { fail(res, error); }
});
module.exports = router;
