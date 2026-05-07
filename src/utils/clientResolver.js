import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { apiFetch } from "./api";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

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
  if (data.linkedUserId === user?.uid || data.uid === user?.uid || snap.id === user?.uid) score += 6;
  if (Array.isArray(data.programmesAssignes)) score += Math.min(10, data.programmesAssignes.length);

  if (options.scoreContent !== false) {
    try {
      const progSnap = await getDocs(
        query(collection(db, "clients", snap.id, "programmes"), limit(options.programmesLimit || 50))
      );
      score += progSnap.size * 4;
    } catch {
      // L'accès aux sous-collections est aussi utilisé comme signal, sans être obligatoire.
    }

    try {
      const nutritionSnap = await getDocs(
        query(collection(db, "clients", snap.id, "nutrition_assessments"), limit(options.nutritionLimit || 30))
      );
      score += nutritionSnap.size * 5;
    } catch {
      // Idem: si la nutrition est refusée sur une piste, on laisse les autres candidats gagner.
    }
  }

  return { snap, score };
}

export async function resolveClientSnapshotForUser(user, options = {}) {
  if (!user?.uid) return null;

  const email = String(user.email || "").trim();
  const emailLower = normalizeEmail(email);
  const candidates = new Map();

  if (emailLower) {
    const exactEmailLowerSnap = await tryGetDocsFromQuery(
      query(collection(db, "clients"), where("emailLower", "==", emailLower), limit(10))
    );
    if (exactEmailLowerSnap?.size === 1) return exactEmailLowerSnap.docs[0];
    if (exactEmailLowerSnap?.size > 1) {
      const scoredExact = await Promise.all(
        exactEmailLowerSnap.docs.map((snap) => scoreClientSnapshot(snap, user, options))
      );
      scoredExact.sort((a, b) => b.score - a.score);
      return scoredExact[0]?.snap || exactEmailLowerSnap.docs[0];
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
  } catch {
    // Le backend est un accélérateur sécurisé; en dev/offline on conserve les anciens fallbacks Firestore.
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
