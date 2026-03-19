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
    };
  } catch {
    return { country: null, city: null };
  }
}

export default function RouteAnalyticsListener({ isAnalyticsOn = true, country, city }) {
  const location = useLocation();
  const { user, effectiveRole } = useAuth();

  // Permet de relancer l'effet quand la géoloc devient disponible
  const [geoTick, setGeoTick] = useState(0);

  // Empêche les doublons + appels parallèles
  const lastKeyRef = useRef(null);
  const inFlightRef = useRef(false);

  // ✅ écoute l’event déclenché par useGeolocation quand BYL_COUNTRY/BYL_CITY sont écrits
  useEffect(() => {
    const handler = () => setGeoTick((t) => t + 1);
    window.addEventListener("BYL_GEO_READY", handler);
    return () => window.removeEventListener("BYL_GEO_READY", handler);
  }, []);

  useEffect(() => {
    if (!isAnalyticsOn) return;

    const geo = getGeoFromStorage();
    const cc = country ?? geo.country;
    const ct = city ?? geo.city;

    const roleEff = effectiveRole || (user?.role ?? null);
    const uid = user?.uid || "anon";

    // Signature unique: si la geo change (unknown -> Cannes), la key change => on re-track (voulu)
    const key = [location.pathname, uid, roleEff || "", cc || "", ct || ""].join("|");

    if (lastKeyRef.current === key) return;
    if (inFlightRef.current) return;

    lastKeyRef.current = key;
    inFlightRef.current = true;

    (async () => {
      try {
        await trackPageView({
          user,
          path: location.pathname,
          country: cc,
          city: ct,
          roleEffectif: roleEff,
        });
      } catch (e) {
        if (import.meta?.env?.DEV) console.warn("trackPageView error:", e);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [
    location.pathname,
    isAnalyticsOn,
    country,
    city,
    user?.uid,
    user?.role,
    effectiveRole,
    geoTick, // ✅ relance quand geo prête
  ]);

  return null;
}

