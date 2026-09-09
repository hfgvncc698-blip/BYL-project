// src/utils/api.js
import { getApiBase } from './apiBase';
import { getAuthHeaders } from './authHeaders';
import { createRequestCoordinator } from './requestCoordinator.js';
const API_BASE = getApiBase();
const requests = createRequestCoordinator();

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

  const run = () => performRequest(url, headers, opts, timeoutMs);
  const method = String(opts.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return requests.mutate(run);
  // A caller-owned AbortSignal has independent cancellation semantics.
  // Include authentication and every request option to keep scopes isolated.
  const key = !opts.signal && !opts.body
    ? JSON.stringify([url, [...headers.entries()].sort(), timeoutMs,
        Object.entries(opts).filter(([name]) => name !== 'headers').sort(([a], [b]) => a.localeCompare(b))])
    : null;
  const result = await requests.read(key, run);
  // Callers may enrich their JSON locally; don't share mutable response data.
  return typeof structuredClone === 'function' ? structuredClone(result) : JSON.parse(JSON.stringify(result));
}

async function performRequest(url, headers, opts, timeoutMs) {
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
  let data = null;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...opts,
      headers,
      signal: externalSignal || timeoutController?.signal,
    });
    try {
      data = await res.json();
    } catch (cause) {
      // Empty/non-JSON responses remain supported, but a body that times out
      // must not become a false successful response after headers arrived.
      if (cause?.name === 'AbortError' || didTimeout) throw cause;
    }
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
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status; err.data = data; err.url = url;
    throw err;
  }
  return data ?? {};
}
