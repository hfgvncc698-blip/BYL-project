import React from "react";
import useGeolocation from "../hooks/useGeolocation";
import { useAuth } from "../AuthContext";
import { useConsent } from "../consent/ConsentContext";

export default function GeolocationBootstrap() {
  const { user } = useAuth();
  const { prefs } = useConsent();

  useGeolocation({
    uid: prefs.analytics && user?.uid ? user.uid : null,
    enabled: !!user && !!prefs.analytics, // ne demande la position pour analytics que si consentement
    watch: false,
    saveToFirestore: !!prefs.analytics,   // n’écrit que si analytics = true
  });

  return null;
}

