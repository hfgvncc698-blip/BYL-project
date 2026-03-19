// src/SunColorModeSync.js
import React, { useEffect, useMemo } from "react";
import { useColorMode } from "@chakra-ui/react";
import useGeolocation from "../hooks/useGeolocation";
import { isDaylightNow, isDayByFallback } from "../utils/sunTimes";

const CHECK_EVERY_MS = 15 * 60 * 1000;
const MANUAL_TTL_MS = 6 * 60 * 60 * 1000; // 6 heures

const STORAGE_KEY = "byl_color_mode_manual";

/**
 * Structure stockée :
 * {
 *   mode: "light" | "dark",
 *   expiresAt: number (timestamp ms)
 * }
 */

function getManualOverride() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.mode || !parsed?.expiresAt) return null;

    // Expiré → on nettoie
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed.mode;
  } catch {
    return null;
  }
}

export function setColorModeManual(mode) {
  // mode: "light" | "dark"
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode,
        expiresAt: Date.now() + MANUAL_TTL_MS,
      })
    );
  } catch {}
}

export function clearColorModeManual() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export default function SunColorModeSync() {
  const { colorMode, setColorMode } = useColorMode();

  const { status, position } = useGeolocation({
    uid: null,
    enabled: true,
    watch: false,
    saveToFirestore: false,
  });

  const wantLight = useMemo(() => {
    const now = new Date();

    if (
      status === "granted" &&
      position?.lat != null &&
      position?.lng != null
    ) {
      const day = isDaylightNow(position.lat, position.lng, now);
      if (day === null) return isDayByFallback(now);
      return day;
    }

    return isDayByFallback(now);
  }, [status, position?.lat, position?.lng]);

  const autoTarget = wantLight ? "light" : "dark";

  const applyTheme = () => {
    const manual = getManualOverride();

    // 🔒 Mode manuel actif
    if (manual) {
      if (colorMode !== manual) {
        setColorMode(manual);
      }
      return;
    }

    // 🌗 Mode automatique
    if (colorMode !== autoTarget) {
      setColorMode(autoTarget);
    }
  };

  // Applique au mount + quand le calcul jour/nuit change
  useEffect(() => {
    applyTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTarget]);

  // Re-check périodique
  useEffect(() => {
    const id = setInterval(applyTheme, CHECK_EVERY_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTarget, colorMode]);

  return null;
}

