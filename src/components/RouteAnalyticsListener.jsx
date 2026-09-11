// src/components/RouteAnalyticsListener.jsx
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { trackPageView } from "../utils/analytics";
import { GEO_PAGE_LOAD_ID, GEO_PAGE_LOAD_STORAGE_KEY } from "../utils/geolocationSession";

function getGeoFromStorage() {
  try {
    const pageLoadId = localStorage.getItem(GEO_PAGE_LOAD_STORAGE_KEY) || null;
    if (pageLoadId !== GEO_PAGE_LOAD_ID) {
      return { country: null, city: null, lat: null, lng: null, accuracy: null, capturedAt: null, source: null, pageLoadId };
    }
    return {
      country: localStorage.getItem("BYL_COUNTRY") || null,
      city: localStorage.getItem("BYL_CITY") || null,
      lat: localStorage.getItem("BYL_LAT") || null,
      lng: localStorage.getItem("BYL_LNG") || null,
      accuracy: localStorage.getItem("BYL_GEO_ACCURACY") || null,
      capturedAt: localStorage.getItem("BYL_GEO_UPDATED_AT") || null,
      source: localStorage.getItem("BYL_GEO_SOURCE") || null,
      pageLoadId,
    };
  } catch {
    return { country: null, city: null, lat: null, lng: null, accuracy: null, capturedAt: null, source: null, pageLoadId: null };
  }
}

function hasUsableGeo(geo) {
  const lat = Number(geo?.lat);
  const lng = Number(geo?.lng);
  return (
    geo?.pageLoadId === GEO_PAGE_LOAD_ID &&
    geo?.lat != null && geo?.lat !== "" && geo?.lng != null && geo?.lng !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

function waitForGeoReady(timeoutMs = 2500) {
  const current = getGeoFromStorage();
  if (hasUsableGeo(current)) return Promise.resolve(current);

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("BYL_GEO_READY", done);
      resolve(getGeoFromStorage());
    };

    const timer = setTimeout(done, timeoutMs);
    window.addEventListener("BYL_GEO_READY", done, { once: true });
  });
}

export default function RouteAnalyticsListener({ isAnalyticsOn = true, consentLoaded = true, country, city }) {
  const location = useLocation();
  const { user, effectiveRole } = useAuth();

  // Permet de relancer l'effet quand la géoloc devient disponible
  const [geoTick, setGeoTick] = useState(0);

  // Empêche les doublons exacts, mais laisse passer une nouvelle visite quand la géoloc arrive.
  const lastKeyRef = useRef(null);
  const inFlightRef = useRef(false);
  const authRetryCountRef = useRef(0);
  const authRetryTimerRef = useRef(null);
  const visitRef = useRef(null);
  const navigationKey = `${location.key || ""}:${location.pathname}${location.search || ""}`;
  if (visitRef.current?.navigationKey !== navigationKey) {
    visitRef.current = { navigationKey, id: `${GEO_PAGE_LOAD_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }

  useEffect(() => () => {
    if (authRetryTimerRef.current) clearTimeout(authRetryTimerRef.current);
  }, []);

  // ✅ écoute l’event déclenché par useGeolocation quand BYL_COUNTRY/BYL_CITY sont écrits
  useEffect(() => {
    const handler = () => setGeoTick((t) => t + 1);
    window.addEventListener("BYL_GEO_READY", handler);
    window.addEventListener("BYL_CONSENT_UPDATED", handler);
    return () => {
      window.removeEventListener("BYL_GEO_READY", handler);
      window.removeEventListener("BYL_CONSENT_UPDATED", handler);
    };
  }, []);

  useEffect(() => {
    const hasAuthenticatedUser = !!user?.uid;
    if (!consentLoaded && !hasAuthenticatedUser) return;
    if (!isAnalyticsOn && !hasAuthenticatedUser) return;

    const geo = getGeoFromStorage();
    const cc = isAnalyticsOn ? country ?? geo.country : null;
    const ct = isAnalyticsOn ? city ?? geo.city : null;
    const lat = isAnalyticsOn ? geo.lat : null;
    const lng = isAnalyticsOn ? geo.lng : null;

    const roleEff = effectiveRole || (user?.role ?? null);
    const uid = user?.uid || "anon";

    // Signature unique: si la geo change (unknown -> Cannes), la key change => on re-track (voulu)
    const key = [
      navigationKey,
      location.pathname,
      location.search || "",
      uid,
      roleEff || "",
      isAnalyticsOn ? "analytics" : "last-seen",
      cc || "",
      ct || "",
      lat || "",
      lng || "",
      Math.floor(Number(geo.capturedAt || 0) / (5 * 60 * 1000)),
    ].join("|");

    if (lastKeyRef.current === key) return;

    lastKeyRef.current = key;
    // A later GPS measurement is a new observation, not a rewrite of an old place.
    const capturedAt = Number(geo.capturedAt || 0);
    if (capturedAt && visitRef.current.capturedAt && capturedAt !== visitRef.current.capturedAt) {
      visitRef.current.id = `${GEO_PAGE_LOAD_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (capturedAt) visitRef.current.capturedAt = capturedAt;
    inFlightRef.current = true;
    const visitId = visitRef.current.id;

    (async () => {
      try {
        const readyGeo = isAnalyticsOn ? await waitForGeoReady() : {};
        const finalCountry = isAnalyticsOn ? country ?? readyGeo.country ?? cc : null;
        const finalCity = isAnalyticsOn ? city ?? readyGeo.city ?? ct : null;
        const finalLat = isAnalyticsOn ? readyGeo.lat ?? lat : null;
        const finalLng = isAnalyticsOn ? readyGeo.lng ?? lng : null;

        // Re-check after waiting for GPS: a settings change may have revoked
        // collection while this visit was in flight. Never send captured fallbacks.
        let locationDisabled = false;
        try { locationDisabled = localStorage.getItem("BYL_LOCATION_ENABLED_V1") === "false"; } catch { /* optional storage */ }
        const result = await trackPageView({
          visitId,
          user,
          path: `${location.pathname}${location.search || ""}`,
          country: locationDisabled ? null : finalCountry,
          city: locationDisabled ? null : finalCity,
          lat: locationDisabled ? null : finalLat,
          lng: locationDisabled ? null : finalLng,
          accuracy: locationDisabled ? null : readyGeo.accuracy ?? geo.accuracy,
          geoCapturedAt: locationDisabled ? null : readyGeo.capturedAt ?? geo.capturedAt,
          geoSource: locationDisabled ? null : readyGeo.source ?? geo.source,
          roleEffectif: roleEff,
          analyticsAllowed: !!isAnalyticsOn,
        });
        if (result?.ok) authRetryCountRef.current = 0;
      } catch (e) {
        if (e?.code === "analytics-auth-not-ready" && authRetryCountRef.current < 3) {
          authRetryCountRef.current += 1;
          lastKeyRef.current = null;
          authRetryTimerRef.current = setTimeout(() => setGeoTick((tick) => tick + 1), 1200);
        }
        if (import.meta?.env?.DEV) console.warn("trackPageView error:", e);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [
    location.pathname,
    location.search,
    location.key,
    navigationKey,
    isAnalyticsOn,
    consentLoaded,
    country,
    city,
    user?.uid,
    user?.role,
    effectiveRole,
    geoTick, // ✅ relance quand geo prête
  ]);

  return null;
}
