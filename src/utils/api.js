// src/utils/api.js
import { getApiBase } from './apiBase';
const API_BASE = getApiBase();

export async function apiFetch(path, { json = true, ...opts } = {}) {
  const url = path.startsWith('http') ? path :
              path.startsWith('/api/') ? `${API_BASE}${path.slice(4)}` : // évite /api/api
              `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(opts.headers || {});
  if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(url, { credentials: 'include', ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status; err.data = data; err.url = url;
    throw err;
  }
  return data ?? {};
}

