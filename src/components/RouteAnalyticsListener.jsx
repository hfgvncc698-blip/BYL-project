// src/components/RouteAnalyticsListener.jsx
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { trackPageView } from "../utils/analytics";

function getGeoFromStorage() {
  try {
    return {
      country: localStorage.getItem("BYL_COUNTRY") || null,
      city: localStorage.getItem("BYL_CITY") || null,
      lat: localStorage.getItem("BYL_LAT") || null,
      lng: localStorage.getItem("BYL_LNG") || null,
    };
  } catch {
    return { country: null, city: null, lat: null, lng: null };
  }
}

function hasUsableGeo(geo) {
  const lat = Number(geo?.lat);
  const lng = Number(geo?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
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
      location.pathname,
      location.search || "",
      uid,
      roleEff || "",
      isAnalyticsOn ? "analytics" : "last-seen",
      cc || "",
      ct || "",
      lat || "",
      lng || "",
    ].join("|");

    if (lastKeyRef.current === key) return;

    lastKeyRef.current = key;
    inFlightRef.current = true;

    (async () => {
      try {
        const readyGeo = isAnalyticsOn ? await waitForGeoReady() : {};
        const finalCountry = isAnalyticsOn ? country ?? readyGeo.country ?? cc : null;
        const finalCity = isAnalyticsOn ? city ?? readyGeo.city ?? ct : null;
        const finalLat = isAnalyticsOn ? readyGeo.lat ?? lat : null;
        const finalLng = isAnalyticsOn ? readyGeo.lng ?? lng : null;

        await trackPageView({
          user,
          path: `${location.pathname}${location.search || ""}`,
          country: finalCountry,
          city: finalCity,
          lat: finalLat,
          lng: finalLng,
          roleEffectif: roleEff,
          analyticsAllowed: !!isAnalyticsOn,
        });
      } catch (e) {
        if (import.meta?.env?.DEV) console.warn("trackPageView error:", e);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [
    location.pathname,
    location.search,
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
