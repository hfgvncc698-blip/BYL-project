const express = require('express');
const admin = require('../firebaseAdmin');
const {
  requireFirebaseAuth
} = require('../utils/firebaseAuth');
const {
  watchInbox,
  replyInbox
} = require('../utils/clubInboxWatch');
const {
  createClubMessaging
} = require('../utils/clubMessaging');
const router = express.Router();
const db = admin.firestore();
const service = createClubMessaging(db);
// Older clients acknowledge the last fetched page without sending a message ID.
// Keep a short-lived delivery watermark, never a permission or a message body.
const legacyDeliveries = new Map();
const deliveryKey = (uid, id) => require('node:crypto').createHash('sha256').update(JSON.stringify([uid, id])).digest('hex');
function rememberPage(res, key, receipt) {
  const existing = legacyDeliveries.get(key) || [];
  const now = Date.now();
  const queue = existing.filter(item => item.until > now);
  if (queue.length < 8) queue.push({
    receipt,
    until: now + 60000
  });
  legacyDeliveries.delete(key);
  legacyDeliveries.set(key, queue);
  setTimeout(() => {
    if (legacyDeliveries.get(key) === queue) legacyDeliveries.delete(key);
  }, 60000).unref();
  if (legacyDeliveries.size > 1024) legacyDeliveries.delete(legacyDeliveries.keys().next().value);
  res.cookie?.('byl_msg_' + key, JSON.stringify(receipt), {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60000,
    path: '/api/messaging/club/read'
  });
}
function deliveredPage(req, key) {
  const queue = legacyDeliveries.get(key);
  if (queue) {
    const now = Date.now();
    while (queue.length && queue[0].until <= now) queue.shift();
    const item = queue.shift();
    if (!queue.length) legacyDeliveries.delete(key);
    if (item) return item.receipt;
  }
  const prefix = 'byl_msg_' + key + '=';
  const cookie = String(req.headers?.cookie || '').split('; ').find(c => c.startsWith(prefix));
  try {
    return cookie && JSON.parse(decodeURIComponent(cookie.slice(prefix.length)));
  } catch {
    return null;
  }
}
const valid = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !value.includes('/');
const fail = (res, error) => {
  if (!error.status) console.error('[club-messaging] request failed', Number.isInteger(error.code) ? error.code : 'unknown');
  return res.status(error.status || 500).json({
    error: error.status ? error.message : 'club-messaging-unavailable'
  });
};
const refFor = info => db.collection('clubConversations').doc(info.contact.id);
router.use(requireFirebaseAuth);
const stamp = t => t && [t.seconds, t.nanoseconds].join(':');
const later = (a, b) => !!a && (!b || a.seconds > b.seconds || a.seconds === b.seconds && a.nanoseconds > b.nanoseconds);
function supportsDelta(row) {
  const sideTime = row.lastBySide?.[row.lastSide];
  return sideTime && stamp(sideTime) === stamp(row.lastMessageAt);
}
function summary(contact, row, side) {
  const other = side === 'club' ? 'member' : 'club';
  const incoming = row.lastSide === other ? row.lastMessageAt : row.lastBySide?.[other];
  const seen = row.readAt?.[side];
  const lastId = row.lastIdBySide?.[other] || '';
  const tiedUnread = lastId && incoming && stamp(incoming) === stamp(seen) && row.readId?.[side] && row.readId[side] < lastId;
  return {
    ...contact,
    unread: later(incoming, seen) || Boolean(tiedUnread),
    lastMessage: row.lastMessage || '',
    lastMessageAt: row.lastMessageAt?.toMillis() || 0,
    receivedVersion: stamp(incoming),
    activityVersion: stamp(row.lastMessageAt),
    deltaSupported: Boolean(supportsDelta(row)),
    ownReadId: row.readId?.[side] || '',
    readId: row.readId?.[other] || '',
    ownReadVersion: stamp(row.readAt?.[side]),
    readVersion: stamp(row.readAt?.[other]),
    peerReadAt: row.readAt?.[other]?.toMillis() || 0
  };
}
function checkedClub(req) {
  const club = req.query.clubId;
  if (club !== undefined && !valid(club)) throw Object.assign(new Error('invalid-club'), {
    status: 400
  });
  return club;
}
router.get('/inbox', async (req, res) => {
  const controller = new AbortController();
  res.once('close', () => controller.abort());
  try {
    const requested = checkedClub(req);
    const first = await service.access(req.auth.uid, req.auth.token).scope(requested);
    const snapshot = await watchInbox(db, first.ownerView ? 'clubId' : 'peerUid', first.clubId || req.auth.uid, req.query.since, controller.signal);
    // Never use the listener or the authorization from before the wait as a grant.
    const access = service.access(req.auth.uid, req.auth.token);
    const scope = await access.scope(requested);
    if (scope.clubId !== first.clubId || scope.ownerView !== first.ownerView) throw Object.assign(new Error('scope-changed'), {
      status: 403
    });
    const contacts = [];
    for (const doc of snapshot.docs) {
      const row = doc.data();
      if (!valid(row.clubId) || !valid(row.targetId) || !['coach', 'client'].includes(row.kind)) continue;
      try {
        const info = await access.authorize(row.clubId, row.kind, row.targetId, scope.preview);
        if (info.contact.id !== doc.id || info.contact.peerUid !== row.peerUid) continue;
        contacts.push(summary(info.contact, row, scope.ownerView ? 'club' : 'member'));
      } catch (error) {
        if (error.status !== 403) throw error;
      }
    }
    if (!controller.signal.aborted) {
      replyInbox(res, req.query.known, snapshot.version, {
        ...scope,
        contacts,
        unreadCount: contacts.filter(c => c.unread).length
      });
    }
  } catch (error) {
    if (!controller.signal.aborted) fail(res, error);
  }
});
router.get('/directory', async (req, res) => {
  try {
    const requested = checkedClub(req);
    const access = service.access(req.auth.uid, req.auth.token);
    await access.scope(requested);
    const info = await service.contacts(req.auth.uid, requested, await access.admin());
    res.set('Cache-Control', 'private, no-store');
    res.json({
      ownerView: info.ownerView,
      preview: info.preview,
      clubId: info.clubId || '',
      clubName: info.clubName || '',
      contacts: info.contacts
    });
  } catch (error) {
    fail(res, error);
  }
});
// Compatibility for installed clients. One scoped query replaces one get per contact.
router.get('/contacts', async (req, res) => {
  try {
    const requested = checkedClub(req);
    const access = service.access(req.auth.uid, req.auth.token);
    const scope = await access.scope(requested);
    const info = await service.contacts(req.auth.uid, requested, scope.preview);
    const snap = await db.collection('clubConversations').where(scope.ownerView ? 'clubId' : 'peerUid', '==', scope.clubId || req.auth.uid).get();
    const rows = new Map(snap.docs.map(d => [d.id, d.data()]));
    const contacts = info.contacts.map(c => {
      const row = rows.get(c.id);
      return summary(c, row && row.peerUid === c.peerUid ? row : {}, scope.ownerView ? 'club' : 'member');
    });
    res.json({
      ...scope,
      contacts
    });
  } catch (error) {
    fail(res, error);
  }
});
async function authorize(req, tx) {
  const input = req.method === 'GET' ? req.query : req.body;
  if (!valid(input.clubId) || !valid(input.targetId) || !['coach', 'client'].includes(input.kind)) throw Object.assign(new Error('invalid-conversation'), {
    status: 400
  });
  const access = service.access(req.auth.uid, req.auth.token, tx);
  const info = await access.authorize(input.clubId, input.kind, input.targetId, await access.admin());
  if (req.method !== 'GET' && info.preview) throw Object.assign(new Error('admin-preview-read-only'), {
    status: 403
  });
  const ref = refFor(info);
  const current = tx ? await tx.get(ref) : await ref.get();
  if (current.exists && current.data().peerUid !== info.contact.peerUid) throw Object.assign(new Error('conversation-account-changed'), {
    status: 403
  });
  return {
    info,
    ref,
    current
  };
}
function sentAt(doc) {
  const data = doc.data();
  return data.sentAt || (data.cancellation?.reviewedAt ? doc.createTime : data.committedAt) || doc.createTime;
}
function messageRow(doc) {
  return {
    ...doc.data(),
    id: doc.id,
    watermark: stamp(sentAt(doc))
  };
}
router.get('/messages', async (req, res) => {
  try {
    const {
      ref,
      info
    } = await authorize(req);
    res.set?.('Cache-Control', 'private, no-store');
    if (req.query.after) {
      const match = /^(\d{1,12}):(\d{1,9})$/.exec(req.query.after);
      if (!match || Number(match[2]) >= 1e9 || req.query.afterId && !valid(req.query.afterId)) return res.status(400).json({
        error: 'invalid-cursor'
      });
      const time = new admin.firestore.Timestamp(Number(match[1]), Number(match[2]));
      let changes = ref.collection('messages').orderBy('committedAt').orderBy(admin.firestore.FieldPath.documentId());
      changes = req.query.afterId ? changes.startAfter(time, req.query.afterId) : changes.where('committedAt', '>', time);
      const page = await changes.limit(51).get();
      const docs = page.docs.slice(0, 50),
        more = page.size > 50;
      return res.json({
        messages: docs.map(messageRow),
        more,
        after: stamp(more ? docs.at(-1).data().committedAt : page.readTime),
        afterId: more ? docs.at(-1).id : ''
      });
    }
    let query = ref.collection('messages').orderBy('createdAtIso', 'desc');
    if (req.query.before) {
      if (!valid(req.query.before)) return res.status(400).json({
        error: 'invalid-cursor'
      });
      const cursor = await ref.collection('messages').doc(req.query.before).get();
      if (!cursor.exists) return res.status(400).json({
        error: 'invalid-cursor'
      });
      query = query.startAfter(cursor);
    }
    const snap = await query.limit(51).get();
    const docs = snap.docs.slice(0, 50);
    if (!req.query.before && req.query.receipt !== 'visible') {
      const inbound = docs.find(doc => doc.data().side !== info.side);
      rememberPage(res, deliveryKey(req.auth.uid, ref.id), inbound ? {
        messageId: inbound.id,
        watermark: stamp(sentAt(inbound))
      } : {
        empty: true
      });
    }
    res.json({
      messages: docs.map(messageRow).reverse(),
      more: snap.size > 50,
      cursor: docs.at(-1)?.id || '',
      after: stamp(snap.readTime)
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/read', async (req, res) => {
  try {
    await db.runTransaction(async tx => {
      const {
        info,
        ref,
        current
      } = await authorize(req, tx);
      let receipt = req.body;
      if (req.body.messageId === undefined) {
        // Keep a transaction retry on the same delivery.
        receipt = req.legacyReceipt ||= deliveredPage(req, deliveryKey(req.auth.uid, ref.id));
        if (!receipt) throw Object.assign(new Error('refresh-thread-first'), {
          status: 409
        });
        if (receipt.empty) return;
      }
      if (!valid(receipt.messageId)) throw Object.assign(new Error('invalid-message-id'), {
        status: 400
      });
      const message = await tx.get(ref.collection('messages').doc(receipt.messageId));
      if (!current.exists || !message.exists || message.data().side === info.side) throw Object.assign(new Error('invalid-read-marker'), {
        status: 400
      });
      const through = sentAt(message);
      if (receipt.watermark !== stamp(through)) throw Object.assign(new Error('message-changed'), {
        status: 409
      });
      const seen = current.data().readAt?.[info.side];
      const seenId = current.data().readId?.[info.side] || '';
      if (later(through, seen) || stamp(through) === stamp(seen) && receipt.messageId > seenId) {
        tx.set(ref, {
          readAt: {
            [info.side]: through
          },
          readId: {
            [info.side]: receipt.messageId
          }
        }, {
          merge: true
        });
      }
    });
    res.json({
      ok: true
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/send', async (req, res) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const requestId = req.body.requestId;
    if (!text || text.length > 4000 || !/^[a-f0-9-]{36}$/.test(requestId || '')) return res.status(400).json({
      error: 'invalid-message'
    });
    const message = await db.runTransaction(async tx => {
      const {
        info,
        ref,
        current
      } = await authorize(req, tx);
      const receipt = ref.collection('requests').doc(`${req.auth.uid}_${requestId}`);
      const existing = await tx.get(receipt);
      if (existing.exists) return existing.data().message;
      let classRequest;
      if (req.body.classRequest) {
        const classId = req.body.classRequest.classId;
        if (info.side !== 'member' || info.contact.kind !== 'client' || !valid(classId)) throw Object.assign(new Error('invalid-class-request'), {
          status: 400
        });
        const course = await tx.get(db.collection('clubs').doc(info.clubId).collection('appointments').doc(classId));
        if (!course.exists || course.data().type !== 'group') throw Object.assign(new Error('invalid-class-request'), {
          status: 400
        });
        classRequest = {
          classId
        };
      }
      const id = `${String(Date.now()).padStart(13, '0')}_${requestId}`;
      const value = {
        ...(classRequest ? {
          classRequest
        } : {}),
        id,
        text,
        senderUid: req.auth.uid,
        side: info.side,
        createdAtIso: new Date().toISOString()
      };
      tx.set(ref.collection('messages').doc(id), {
        ...value,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        committedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      tx.set(receipt, {
        message: value
      });
      tx.set(ref, {
        clubId: info.clubId,
        kind: info.contact.kind,
        targetId: info.contact.targetId,
        peerUid: info.contact.peerUid,
        lastMessage: text.slice(0, 180),
        lastSide: info.side,
        lastIdBySide: {
          [info.side]: id
        },
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastBySide: {
          ...(current.data()?.lastSide && current.data().lastMessageAt ? {
            [current.data().lastSide]: current.data().lastMessageAt
          } : {}),
          [info.side]: admin.firestore.FieldValue.serverTimestamp()
        }
      }, {
        merge: true
      });
      return value;
    });
    res.status(201).json({
      message
    });
  } catch (error) {
    fail(res, error);
  }
});
module.exports = router;
