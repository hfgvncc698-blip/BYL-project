import { getApiBase } from "./apiBase";
import { auth } from "../firebaseConfig";

const API_BASE = getApiBase();

function fmtDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function markLocalPageViewDay() {
  try {
    localStorage.setItem("BYL_LAST_PAGEVIEW_DAY", fmtDay(new Date()));
    window.dispatchEvent(new Event("BYL_PAGEVIEW_MARKED"));
  } catch {
    // ignore
  }
}

function cleanVisitorPart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120);
}

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

function cleanCoordinate(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function hasUsableCoords(lat, lng) {
  return lat != null && lng != null && !(lat === 0 && lng === 0);
}

export function getVisitorId(user = null) {
  const uid = cleanVisitorPart(user?.uid || user?.id || "");
  if (uid) return `uid:${uid}`;
  return getAnonVisitorId();
}

export async function trackPageView({
  user,
  path,
  country,
  city,
  roleEffectif,
  lat,
  lng,
  analyticsAllowed = true,
}) {
  const authUser = auth.currentUser;
  const uid = cleanVisitorPart(authUser?.uid || user?.uid || user?.id || "");
  const visitorId = uid ? `uid:${uid}` : getVisitorId(user);
  const cleanLat = cleanCoordinate(lat, -90, 90);
  const cleanLng = cleanCoordinate(lng, -180, 180);
  const includeCoords = hasUsableCoords(cleanLat, cleanLng);
  const payload = {
    path: path || "/",
    country: country || null,
    city: city || null,
    roleEffectif: roleEffectif || null,
    visitorId,
    uid: uid || null,
    analyticsAllowed: analyticsAllowed !== false,
    lat: includeCoords ? cleanLat : null,
    lng: includeCoords ? cleanLng : null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  };

  try {
    const headers = { "Content-Type": "application/json" };
    try {
      const tokenSource = typeof user?.getIdToken === "function" ? user : authUser;
      if (typeof tokenSource?.getIdToken === "function") {
        const token = await tokenSource.getIdToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // The event remains useful as anonymous analytics if the token is unavailable.
    }

    const response = await fetch(`${API_BASE}/analytics/pageview`, {
      method: "POST",
      headers,
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    try {
      localStorage.setItem(
        "BYL_LAST_ANALYTICS_RESULT",
        JSON.stringify({
          ok: response.ok && data?.ok !== false,
          status: response.status,
          day: data?.day || null,
          geoId: data?.geoId || null,
          geolocated: !!data?.geolocated,
          at: new Date().toISOString(),
        })
      );
    } catch {
      // ignore
    }
    if (response.ok && data?.ok !== false) {
      markLocalPageViewDay();
    } else if (import.meta?.env?.DEV) {
      console.warn("Analytics pageview not recorded:", response.status, data);
    }
  } catch (error) {
    if (import.meta?.env?.DEV) console.warn("Analytics pageview request failed:", error);
    // Analytics is best-effort: local/dev backends can be offline without affecting the app.
  }
}

export async function trackEvent() {
  // Réservé pour une route backend dédiée si les événements produit deviennent nécessaires.
}
