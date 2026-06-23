// src/SunColorModeSync.js
import React, { useEffect, useMemo, useState } from "react";
import { useColorMode } from "@chakra-ui/react";
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

function getCachedPosition() {
  try {
    const lat = Number(localStorage.getItem("BYL_LAT"));
    const lng = Number(localStorage.getItem("BYL_LNG"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
    return { lat, lng };
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
  const [cachedPosition, setCachedPosition] = useState(getCachedPosition);

  useEffect(() => {
    const handler = () => setCachedPosition(getCachedPosition());
    window.addEventListener("BYL_GEO_READY", handler);
    return () => window.removeEventListener("BYL_GEO_READY", handler);
  }, []);

  const wantLight = useMemo(() => {
    const now = new Date();

    if (cachedPosition?.lat != null && cachedPosition?.lng != null) {
      const day = isDaylightNow(cachedPosition.lat, cachedPosition.lng, now);
      if (day === null) return isDayByFallback(now);
      return day;
    }

    return isDayByFallback(now);
  }, [cachedPosition?.lat, cachedPosition?.lng]);

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
     
  }, [autoTarget]);

  // Re-check périodique
  useEffect(() => {
    const id = setInterval(applyTheme, CHECK_EVERY_MS);
    return () => clearInterval(id);
     
  }, [autoTarget, colorMode]);

  return null;
}
