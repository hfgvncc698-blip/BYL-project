// src/components/RouteAnalyticsListener.jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { trackPageView } from "../utils/analytics";

function getGeoFromStorage() {
  try {
    return {
      country: localStorage.getItem("BYL_COUNTRY") || null,  // "FR"
      city: localStorage.getItem("BYL_CITY") || null,        // "Antibes"
    };
  } catch {
    return { country: null, city: null };
  }
}

export default function RouteAnalyticsListener({ isAnalyticsOn = true, country, city }) {
  const location = useLocation();
  const { user, effectiveRole } = useAuth();

  useEffect(() => {
    if (!isAnalyticsOn) return;

    const geo = getGeoFromStorage();
    const cc = country ?? geo.country;
    const ct = city ?? geo.city;

    trackPageView({
      user,
      path: location.pathname,
      country: cc,
      city: ct,
      roleEffectif: effectiveRole || (user?.role ?? null),
    });
  }, [location.pathname, isAnalyticsOn, user, effectiveRole, country, city]);

  return null;
}

