// src/utils/api.js
import { getApiBase } from './apiBase';
import { getAuthHeaders } from './authHeaders';
const API_BASE = getApiBase();

export async function apiFetch(path, { json = true, timeoutMs = 20000, ...opts } = {}) {
  const url = path.startsWith('http') ? path :
              path.startsWith('/api/') ? `${API_BASE}${path.slice(4)}` : // évite /api/api
              `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(opts.headers || {});
  if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('Authorization')) {
    const authHeaders = await getAuthHeaders();
    Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));
  }

  const externalSignal = opts.signal;
  const timeoutController = !externalSignal && timeoutMs > 0 ? new AbortController() : null;
  let timeoutId;
  let didTimeout = false;
  if (timeoutController) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      timeoutController.abort();
    }, timeoutMs);
  }

  let res;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...opts,
      headers,
      signal: externalSignal || timeoutController?.signal,
    });
  } catch (cause) {
    if (cause?.name === "AbortError" && didTimeout) {
      const err = new Error("Le serveur met trop de temps à répondre. Réessaie dans un instant.");
      err.code = "api-timeout";
      err.cause = cause;
      err.url = url;
      throw err;
    }
    if (cause?.name === "AbortError") throw cause;
    const err = new Error(
      import.meta.env.DEV
        ? "API locale indisponible. Lance le backend avec npm run dev:api, puis réessaie."
        : "Connexion API impossible. Réessaie dans un instant."
    );
    err.cause = cause;
    err.url = url;
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status; err.data = data; err.url = url;
    throw err;
  }
  return data ?? {};
}
