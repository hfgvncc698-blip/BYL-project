import React, { useEffect, useMemo, useRef } from "react";
import { useColorMode } from "@chakra-ui/react";
import useGeolocation from "../hooks/useGeolocation";
import { isDaylightNow, isDayByFallback } from "../utils/sunTimes";

const CHECK_EVERY_MS = 15 * 60 * 1000;

export default function SunColorModeSync() {
  const { setColorMode } = useColorMode();

  // Toujours demandé par le navigateur (l’utilisateur peut accepter/refuser).
  // On n’écrit rien en base.
  const { status, position } = useGeolocation({
    uid: null,
    enabled: true,
    watch: false,
    saveToFirestore: false,
  });

  const wantLight = useMemo(() => {
    const now = new Date();
    if (status === "granted" && position?.lat != null && position?.lng != null) {
      const day = isDaylightNow(position.lat, position.lng, now);
      if (day === null) return isDayByFallback(now);
      return day;
    }
    return isDayByFallback(now);
  }, [status, position?.lat, position?.lng]);

  useEffect(() => {
    setColorMode(wantLight ? "light" : "dark");
  }, [wantLight, setColorMode]);

  useEffect(() => {
    const id = setInterval(() => setColorMode(wantLight ? "light" : "dark"), CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [wantLight, setColorMode]);

  return null;
}

