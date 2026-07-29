import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { apiFetch } from "./api";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const CLIENT_RESOLVE_CACHE_TTL_MS = 2 * 60 * 1000;
const CLIENT_RESOLVE_LOCAL_TTL_MS = 24 * 60 * 60 * 1000;
const clientResolveCache = new Map();
const pendingClientResolve = new Map();

const getClientResolveCacheKey = (user) =>
  user?.uid ? `${user.uid}:${normalizeEmail(user.email)}` : "";

const getLocalClientResolveKey = (user) =>
  user?.uid ? `byl:client-resolve:${getClientResolveCacheKey(user)}` : "";

function readLocalClientId(user) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getLocalClientResolveKey(user));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.clientId || Date.now() - Number(parsed.at || 0) > CLIENT_RESOLVE_LOCAL_TTL_MS) return null;
    return String(parsed.clientId);
  } catch {
    return null;
  }
}

function writeLocalClientId(user, clientId) {
  if (typeof window === "undefined" || !clientId) return;
  try {
    window.localStorage.setItem(
      getLocalClientResolveKey(user),
      JSON.stringify({ at: Date.now(), clientId })
    );
  } catch {
    // Cache best-effort uniquement.
  }
}

const addExistingSnapshot = (candidates, snap) => {
  if (snap?.exists?.()) candidates.set(snap.id, snap);
};

const addQuerySnapshots = (candidates, snap) => {
  snap?.docs?.forEach((docSnap) => addExistingSnapshot(candidates, docSnap));
};

async function tryReadDoc(candidates, path) {
  if (!path) return;
  try {
    addExistingSnapshot(candidates, await getDoc(path));
  } catch {
    // Chaque piste est optionnelle: les règles Firestore peuvent refuser les anciens chemins.
  }
}

async function tryReadQuery(candidates, q) {
  if (!q) return;
  try {
    addQuerySnapshots(candidates, await getDocs(q));
  } catch {
    // On garde les autres pistes pour ne pas bloquer l'espace client.
  }
}

async function tryGetDocsFromQuery(q) {
  if (!q) return null;
  try {
    return await getDocs(q);
  } catch {
    return null;
  }
}

async function scoreClientSnapshot(snap, user, options = {}) {
  const data = snap.data() || {};
  const emailLower = normalizeEmail(user?.email);
  const docEmailLower = normalizeEmail(data.emailLower);
  const docEmail = normalizeEmail(data.email);
  let score = 0;

  if (docEmailLower && emailLower && docEmailLower === emailLower) score += 40;
  else if (docEmail && emailLower && docEmail === emailLower) score += 15;
  if (snap.id === user?.linkedClientId) score += 8;
  if (
    data.linkedUserId === user?.uid ||
    data.accountUid === user?.uid ||
    data.uid === user?.uid ||
    snap.id === user?.uid
  ) score += 6;
  if (Array.isArray(data.programmesAssignes)) score += Math.min(10, data.programmesAssignes.length);

  if (options.scoreContent !== false) {
    try {
      const progSnap = await getDocs(
        query(collection(db, "clients", snap.id, "programmes"), limit(options.programmesLimit || 6))
      );
      score += progSnap.size * 4;
    } catch {
      // L'accès aux sous-collections est aussi utilisé comme signal, sans être obligatoire.
    }

    try {
      const nutritionSnap = await getDocs(
        query(collection(db, "clients", snap.id, "nutrition_assessments"), limit(options.nutritionLimit || 6))
      );
      score += nutritionSnap.size * 5;
    } catch {
      // Idem: si la nutrition est refusée sur une piste, on laisse les autres candidats gagner.
    }
  }

  return { snap, score };
}

async function resolveClientSnapshotForUserUncached(user, options = {}) {
  if (!user?.uid) return null;

  const email = String(user.email || "").trim();
  const emailLower = normalizeEmail(email);
  const candidates = new Map();

  if (user.linkedClientId) {
    try {
      const linkedSnap = await getDoc(doc(db, "clients", user.linkedClientId));
      if (linkedSnap.exists()) return linkedSnap;
    } catch {
      // On conserve les autres pistes si ce chemin direct est refusé.
    }
  }

  try {
    const uidSnap = await getDoc(doc(db, "clients", user.uid));
    if (uidSnap.exists()) return uidSnap;
  } catch {
    // Les anciens dossiers n'utilisent pas toujours l'UID comme identifiant.
  }

  const [linkedUserSnap, uidFieldSnap] = await Promise.all([
    tryGetDocsFromQuery(
      query(collection(db, "clients"), where("linkedUserId", "==", user.uid), limit(2))
    ),
    tryGetDocsFromQuery(
      query(collection(db, "clients"), where("uid", "==", user.uid), limit(2))
    ),
  ]);
  const identityMatches = [
    ...(linkedUserSnap?.docs || []),
    ...(uidFieldSnap?.docs || []),
  ];
  if (identityMatches.length) {
    const uniqueIdentityMatches = new Map(
      identityMatches.map((snap) => [snap.id, snap])
    );
    return uniqueIdentityMatches.values().next().value || null;
  }

  const localClientId = readLocalClientId(user);
  if (localClientId) {
    try {
      const localSnap = await getDoc(doc(db, "clients", localClientId));
      const localData = localSnap.data() || {};
      const isStrongIdentityMatch =
        localSnap.id === user.uid ||
        localData.linkedUserId === user.uid ||
        localData.accountUid === user.uid ||
        localData.uid === user.uid;
      if (localSnap.exists() && isStrongIdentityMatch) return localSnap;
    } catch {
      // Si le cache local est obsolète ou refusé, on retombe sur les pistes robustes.
    }
  }

  try {
    const resolved = await apiFetch("/client-profile/resolve-client", { json: false });
    if (resolved?.clientId) {
      await tryReadDoc(candidates, doc(db, "clients", resolved.clientId));
      if (!candidates.has(resolved.clientId) && resolved.client) {
        return {
          id: resolved.clientId,
          exists: () => true,
          data: () => resolved.client || {},
        };
      }

      const backendSnap = candidates.get(resolved.clientId);
      if (backendSnap) return backendSnap;
    }
  } catch (error) {
    if (
      error?.status === 409 &&
      error?.data?.error === "client-profile-ambiguous"
    ) {
      if (options.logPrefix) {
        console.error(
          `[${options.logPrefix}] Plusieurs dossiers utilisent le même e-mail; résolution bloquée par sécurité.`
        );
      }
      return null;
    }
    // Le backend est un accélérateur sécurisé; en dev/offline on conserve les anciens fallbacks Firestore.
  }

  if (emailLower) {
    const exactEmailLowerSnap = await tryGetDocsFromQuery(
      query(collection(db, "clients"), where("emailLower", "==", emailLower), limit(10))
    );
    if (exactEmailLowerSnap?.size === 1) return exactEmailLowerSnap.docs[0];
    if (exactEmailLowerSnap?.size > 1) return null;
  }

  if (email) {
    await tryReadQuery(candidates, query(collection(db, "clients"), where("email", "==", email), limit(20)));
  }

  if (emailLower && emailLower !== email) {
    await tryReadQuery(candidates, query(collection(db, "clients"), where("email", "==", emailLower), limit(20)));
  }

  if (user.linkedClientId) {
    await tryReadDoc(candidates, doc(db, "clients", user.linkedClientId));
  }

  await tryReadDoc(candidates, doc(db, "clients", user.uid));
  await tryReadQuery(candidates, query(collection(db, "clients"), where("linkedUserId", "==", user.uid), limit(5)));
  await tryReadQuery(candidates, query(collection(db, "clients"), where("uid", "==", user.uid), limit(5)));

  if (!candidates.size) {
    if (options.logPrefix) {
      console.warn(`[${options.logPrefix}] Aucun document client trouvé pour`, user.uid, email);
    }
    return null;
  }

  const scored = await Promise.all(
    Array.from(candidates.values()).map((snap) => scoreClientSnapshot(snap, user, options))
  );

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.snap || null;
}

export async function resolveClientSnapshotForUser(user, options = {}) {
  if (!user?.uid) return null;

  const cacheKey = getClientResolveCacheKey(user);
  const now = Date.now();
  const cached = clientResolveCache.get(cacheKey);
  if (!options.disableCache && cached && now - cached.at < CLIENT_RESOLVE_CACHE_TTL_MS) {
    return cached.snap;
  }

  if (!options.disableCache && pendingClientResolve.has(cacheKey)) {
    return pendingClientResolve.get(cacheKey);
  }

  const promise = resolveClientSnapshotForUserUncached(user, options)
    .then((snap) => {
      clientResolveCache.set(cacheKey, { at: Date.now(), snap });
      if (snap?.id) writeLocalClientId(user, snap.id);
      return snap;
    })
    .finally(() => {
      pendingClientResolve.delete(cacheKey);
    });

  if (!options.disableCache) pendingClientResolve.set(cacheKey, promise);
  return promise;
}
