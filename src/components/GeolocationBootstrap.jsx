// src/components/GeolocationBootstrap.jsx
import React from "react";
import useGeolocation from "../hooks/useGeolocation";
import { useAuth } from "../AuthContext";
import { useConsent } from "../consent/ConsentContext";

export default function GeolocationBootstrap() {
  const { user, effectiveRole, isAdmin } = useAuth();
  const { prefs } = useConsent();

  const analyticsOn = !!prefs?.analytics || isAdmin || effectiveRole === "admin";

  useGeolocation({
    uid: analyticsOn && user?.uid ? user.uid : null,

    // ✅ On demande la géoloc uniquement si consentement analytics = true
    enabled: analyticsOn,

    watch: false,

    // ✅ Ecrit users/{uid}.location seulement si connecté + analytics
    saveUserLocation: analyticsOn && !!user?.uid,

    // ✅ Ecrit analytics_geo + (et on va aussi pousser localStorage dans le hook)
    saveAnalytics: analyticsOn,
  });

  return null;
}
