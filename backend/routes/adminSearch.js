const express = require('express');
const router = express.Router();

const { db } = require('../utils/db');
const withRetry = require('../utils/withRetry');

/* ---------- middleware: clé admin ---------- */
function requireAdminKey(req, res, next) {
  const hdr = req.header('x-admin-key');
  const expected = process.env.ADMIN_SEARCH_KEY;
  if (!expected || hdr !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(requireAdminKey);

/* ---------- helpers ---------- */
const norm = (s) =>
  (s || '')
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => (out[k] = obj?.[k] ?? null));
  return out;
}

function simplifyClient(id, data) {
  const name =
    [data?.prenom, data?.nom].filter(Boolean).join(' ') ||
    data?.displayName ||
    data?.name ||
    '—';

  return {
    type: 'client',
    id,
    name,
    email: data?.email || null,
    phone: data?.phone || data?.tel || null,
    abonnementActif: !!data?.abonnementActif,
    stripeCustomerId: data?.stripeCustomerId || null,
    stripeSubscriptionId: data?.stripeSubscriptionId || null,
    createdAt: data?.createdAt?.toDate?.() || null,
    raw: pick(data, ['prenom', 'nom', 'niveauSportif', 'sexe']),
  };
}

function simplifyUser(id, data) {
  const name =
    [data?.firstName, data?.lastName].filter(Boolean).join(' ') ||
    data?.displayName ||
    data?.name ||
    '—';

  return {
    type: 'user',
    id,
    name,
    email: data?.email || null,
    phone: data?.phone || data?.tel || null,
    hasActiveSubscription: !!data?.hasActiveSubscription,
    subscriptionStatus: data?.subscriptionStatus || null,
    stripeCustomerId: data?.stripeCustomerId || null,
    stripeSubscriptionId: data?.stripeSubscriptionId || null,
    createdAt: data?.createdAt?.toDate?.() || null,
    raw: pick(data, ['firstName', 'lastName', 'role']),
  };
}

/* ---------- stratégie de recherche ---------- */
/**
 * On essaie :
 * 1) des égalités directes sur champs “exacts” (email, ids Stripe, téléphone)
 * 2) des préfixes si on a des champs *Lower (emailLower, prenomLower, nomLower, fullNameLower)
 * 3) fallback : on lit N docs récents et on filtre en mémoire (OK sur petits volumes)
 */

async function queryEquals(col, field, value, limit = 20) {
  return withRetry(() =>
    db.collection(col).where(field, '==', value).limit(limit).get()
  );
}

async function queryPrefix(col, field, prefix, limit = 20) {
  // nécessite l'existence de ce field sur les docs; sinon renvoie juste ceux qui l'ont
  return withRetry(() =>
    db
      .collection(col)
      .orderBy(field)
      .startAt(prefix)
      .endAt(prefix + '\uf8ff')
      .limit(limit)
      .get()
  );
}

async function fetchRecent(col, limit = 200) {
  // lit les plus récents (ou le plus “indexable” trouvé)
  const ref = db.collection(col);
  // essaie createdAt desc si disponible, sinon sans orderBy
  try {
    return await withRetry(() =>
      ref.orderBy('createdAt', 'desc').limit(limit).get()
    );
  } catch {
    return await withRetry(() => ref.limit(limit).get());
  }
}

/* ---------- recherche clients ---------- */
async function searchClients(q, limit = 20) {
  const hits = new Map();
  const qn = norm(q);

  if (!qn) {
    const snap = await fetchRecent('clients', limit);
    snap.forEach((d) => hits.set(d.id, simplifyClient(d.id, d.data())));
    return Array.from(hits.values()).slice(0, limit);
  }

  // 1) égalités directes
  const equalityFields = [
    'email',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'phone',
    'tel',
    'id', // au cas où tu colles un id brut
  ];
  for (const f of equalityFields) {
    const s = await queryEquals('clients', f, q, limit);
    s.forEach((d) => hits.set(d.id, simplifyClient(d.id, d.data())));
  }

  // 2) préfixes sur *Lower si dispos
  const prefixFields = [
    'emailLower',
    'prenomLower',
    'nomLower',
    'fullNameLower',
    'displayNameLower',
  ];
  for (const f of prefixFields) {
    try {
      const s = await queryPrefix('clients', f, qn, limit);
      s.forEach((d) => hits.set(d.id, simplifyClient(d.id, d.data())));
    } catch {
      // champ absent / pas indexé -> on ignore
    }
  }

  // 3) fallback : lecture récente + filtre local
  if (hits.size < limit) {
    const recent = await fetchRecent('clients', 200);
    recent.forEach((d) => {
      const c = d.data();
      const bucket = [
        c?.email,
        c?.prenom,
        c?.nom,
        [c?.prenom, c?.nom].filter(Boolean).join(' '),
        c?.displayName,
        c?.phone || c?.tel,
        c?.stripeCustomerId,
        c?.stripeSubscriptionId,
      ]
        .filter(Boolean)
        .map(norm)
        .join(' ');

      if (bucket.includes(qn)) {
        hits.set(d.id, simplifyClient(d.id, c));
      }
    });
  }

  return Array.from(hits.values()).slice(0, limit);
}

/* ---------- recherche users ---------- */
async function searchUsers(q, limit = 20) {
  const hits = new Map();
  const qn = norm(q);

  if (!qn) {
    const snap = await fetchRecent('users', limit);
    snap.forEach((d) => hits.set(d.id, simplifyUser(d.id, d.data())));
    return Array.from(hits.values()).slice(0, limit);
  }

  // 1) égalités directes
  const equalityFields = [
    'email',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'phone',
    'tel',
    'id',
  ];
  for (const f of equalityFields) {
    const s = await queryEquals('users', f, q, limit);
    s.forEach((d) => hits.set(d.id, simplifyUser(d.id, d.data())));
  }

  // 2) préfixes
  const prefixFields = [
    'emailLower',
    'firstNameLower',
    'lastNameLower',
    'fullNameLower',
    'displayNameLower',
  ];
  for (const f of prefixFields) {
    try {
      const s = await queryPrefix('users', f, qn, limit);
      s.forEach((d) => hits.set(d.id, simplifyUser(d.id, d.data())));
    } catch {
      // ignore
    }
  }

  // 3) fallback
  if (hits.size < limit) {
    const recent = await fetchRecent('users', 200);
    recent.forEach((d) => {
      const u = d.data();
      const bucket = [
        u?.email,
        u?.firstName,
        u?.lastName,
        [u?.firstName, u?.lastName].filter(Boolean).join(' '),
        u?.displayName,
        u?.phone || u?.tel,
        u?.stripeCustomerId,
        u?.stripeSubscriptionId,
      ]
        .filter(Boolean)
        .map(norm)
        .join(' ');

      if (bucket.includes(qn)) {
        hits.set(d.id, simplifyUser(d.id, u));
      }
    });
  }

  return Array.from(hits.values()).slice(0, limit);
}

/* ---------- route /api/admin/search ---------- */
router.get('/search', async (req, res) => {
  try {
    const type = (req.query.type || 'all').toString();
    const q = (req.query.q || '').toString();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));

    let out = [];
    if (type === 'clients') {
      out = await searchClients(q, limit);
    } else if (type === 'users') {
      out = await searchUsers(q, limit);
    } else {
      const [a, b] = await Promise.all([searchClients(q, limit), searchUsers(q, limit)]);
      out = [...a, ...b].slice(0, limit);
    }

    res.json({ hits: out });
  } catch (e) {
    console.error('[adminSearch] error:', e);
    res.status(500).json({ error: 'Search failed', detail: String(e?.message || e) });
  }
});

module.exports = router;

