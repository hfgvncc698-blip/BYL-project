import { getApiBase } from "./apiBase";

const API_BASE = getApiBase();

function getAnonVisitorId() {
  try {
    const key = "BYL_ANON_ID";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
      localStorage.setItem(key, id);
    }
    return `anon:${id}`;
  } catch {
    return `anon:${Math.random().toString(36).slice(2)}`;
  }
}

export function getVisitorId() {
  return getAnonVisitorId();
}

export async function trackPageView({
  path,
  country,
  city,
  roleEffectif,
}) {
  try {
    await fetch(`${API_BASE}/analytics/pageview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        path: path || "/",
        country: country || null,
        city: city || null,
        roleEffectif: roleEffectif || null,
        visitorId: getVisitorId(),
      }),
    });
  } catch {
    // Analytics is best-effort: local/dev backends can be offline without affecting the app.
  }
}

export async function trackEvent() {
  // Réservé pour une route backend dédiée si les événements produit deviennent nécessaires.
}
