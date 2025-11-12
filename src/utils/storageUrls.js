// src/utils/storageUrls.js
import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";

/** Détecte une ressource locale (public/, /src, etc.) */
function isLocalAsset(p) {
  if (!p) return false;
  const s = String(p);
  if (s.startsWith("/") || s.startsWith("./") || s.startsWith("../")) return true;
  // Pas de schéma, pas de gs:// et pas de slash -> probablement un fichier local (ex: "logo.png")
  if (!/^([a-z]+:)?\/\//i.test(s) && !s.startsWith("gs://") && !s.includes("/")) return true;
  return false;
}

/** Normalise un chemin Storage (supprime les / de tête) */
function normalizePath(p = "") {
  return String(p || "").replace(/^\/+/, "");
}

/** Encode chaque segment du chemin (espaces, accents…) */
function encodePathSegments(p = "") {
  const clean = normalizePath(p);
  return clean
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

/** Cache (résultats + promesses en cours) */
const _valueCache = new Map();     // key -> string|null
const _promiseCache = new Map();   // key -> Promise<string|null>

/**
 * Renvoie une URL exploitable par le navigateur :
 * - http(s) ou asset local -> renvoie tel quel
 * - "gs://..."             -> getDownloadURL
 * - "folder/file"          -> getDownloadURL
 *
 * Options:
 *  - quiet: ne pas loguer les erreurs (par défaut true)
 */
export async function getPublicUrl(pathOrUrl, { quiet = true } = {}) {
  if (!pathOrUrl) return null;
  const key = String(pathOrUrl);

  // Déjà en cache (y compris cache négatif)
  if (_valueCache.has(key)) return _valueCache.get(key);

  // URL absolue (http/https) ou asset local → tel quel
  if (/^https?:\/\//i.test(key) || isLocalAsset(key)) {
    _valueCache.set(key, key);
    return key;
  }

  // Si une requête est déjà en cours pour cette clé, on l'attend
  if (_promiseCache.has(key)) return _promiseCache.get(key);

  const run = (async () => {
    try {
      const storage = getStorage();

      // gs://…  ou  chemin relatif Storage
      const ref =
        /^gs:\/\//i.test(key)
          ? storageRef(storage, key) // le SDK accepte gs://
          : storageRef(storage, encodePathSegments(key)); // encode segments

      const url = await getDownloadURL(ref);
      _valueCache.set(key, url);
      return url;
    } catch (e) {
      // Cache négatif pour éviter les tentatives répétées sur un objet inexistant
      _valueCache.set(key, null);
      if (!quiet) {
        // eslint-disable-next-line no-console
        console.warn("[storageUrls] getPublicUrl error for:", key, e);
      }
      return null;
    } finally {
      _promiseCache.delete(key);
    }
  })();

  _promiseCache.set(key, run);
  return run;
}

/** Alias pratique déjà utilisé dans le code */
export async function resolveStorageUrl(maybePath, opts) {
  if (!maybePath) return null;
  const s = String(maybePath);
  if (/^https?:\/\//i.test(s) || isLocalAsset(s)) return s;
  return getPublicUrl(s, opts);
}

/**
 * Essaie une liste de chemins/urls et renvoie le **premier** qui existe.
 * Utile pour tester différentes casses ou emplacements (ex: logos/UID/Logo.png, Logo-BYL.png, etc.).
 * Options:
 *  - quiet: ne pas loguer les erreurs (par défaut true)
 */
export async function findFirstExisting(paths = [], { quiet = true } = {}) {
  for (const p of paths) {
    const url = await getPublicUrl(p, { quiet });
    if (url) return url;
  }
  return null;
}

/** Permet d’invalider le cache si besoin (ex: après upload d’un fichier) */
export function clearStorageUrlCache() {
  _valueCache.clear();
  _promiseCache.clear();
}

