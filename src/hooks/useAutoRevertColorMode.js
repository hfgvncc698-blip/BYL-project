// src/hooks/useAutoRevertColorMode.js
import { useEffect, useCallback } from "react";
import { useColorMode } from "@chakra-ui/react";

const KEY_TS = "byl_color_mode_manual_ts";
const KEY_MODE = "byl_color_mode_manual_value";
const KEY_VERSION = "byl_color_mode_manual_version";
const LEGACY_SUN_KEY = "byl_color_mode_manual";
const MANUAL_VERSION = "2";
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

const getSystemMode = () => {
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  return prefersDark ? "dark" : "light";
};

const hasManual = () => {
  const ts = Number(localStorage.getItem(KEY_TS) || 0);
  const manualValue = localStorage.getItem(KEY_MODE);
  const version = localStorage.getItem(KEY_VERSION);
  if (!ts || !manualValue || version !== MANUAL_VERSION) {
    localStorage.removeItem("chakra-ui-color-mode");
    localStorage.removeItem(KEY_TS);
    localStorage.removeItem(KEY_MODE);
    localStorage.removeItem(KEY_VERSION);
    localStorage.removeItem(LEGACY_SUN_KEY);
    return false;
  }
  if (Date.now() - ts >= TTL_MS) {
    localStorage.removeItem("chakra-ui-color-mode");
    localStorage.removeItem(KEY_TS);
    localStorage.removeItem(KEY_MODE);
    localStorage.removeItem(KEY_VERSION);
    localStorage.removeItem(LEGACY_SUN_KEY);
    return false;
  }
  return true;
};

export default function useAutoRevertColorMode() {
  const { colorMode, setColorMode } = useColorMode();

  const clearManual = useCallback(() => {
    localStorage.removeItem("chakra-ui-color-mode");
    localStorage.removeItem(KEY_TS);
    localStorage.removeItem(KEY_MODE);
    localStorage.removeItem(KEY_VERSION);
    localStorage.removeItem(LEGACY_SUN_KEY);
  }, []);

  const checkExpiry = useCallback(() => {
    try {
      const ts = Number(localStorage.getItem(KEY_TS) || 0);
      const manualValue = localStorage.getItem(KEY_MODE);
      if (!ts || !manualValue) return;

      const age = Date.now() - ts;
      if (age >= TTL_MS) {
        clearManual();
        // Revert vers le thème système (et on continue à suivre le système via le listener)
        setColorMode(getSystemMode());
      }
    } catch {
      // ignore
    }
  }, [clearManual, setColorMode]);

  useEffect(() => {
    // 1) check expiry au montage + toutes les 60s
    checkExpiry();
    const interval = setInterval(checkExpiry, 60 * 1000);
    return () => clearInterval(interval);
  }, [checkExpiry]);

  useEffect(() => {
    // 2) si pas de choix manuel => on suit le système en live
    if (!window.matchMedia) return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const applyIfNoManual = () => {
      if (hasManual()) return;
      const sys = getSystemMode();
      if (sys !== colorMode) setColorMode(sys);
    };

    // sync immédiat (si aucun manuel)
    applyIfNoManual();

    // écoute les changements système
    if (mql.addEventListener) mql.addEventListener("change", applyIfNoManual);
    else mql.addListener(applyIfNoManual);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", applyIfNoManual);
      else mql.removeListener(applyIfNoManual);
    };
  }, [colorMode, setColorMode]);

  // helper à utiliser quand user force un thème
  const markManualChoice = (nextMode) => {
    try {
      localStorage.setItem(KEY_TS, String(Date.now()));
      localStorage.setItem(KEY_MODE, String(nextMode));
      localStorage.setItem(KEY_VERSION, MANUAL_VERSION);
    } catch {}
  };

  return { markManualChoice, current: colorMode };
}
