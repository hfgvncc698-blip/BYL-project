import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ensureLanguageLoaded } from "../i18n";

const SUPPORTED = ["fr","en","it","es","de","ru","ar"];
const RTL = new Set(["ar"]);
const STORAGE_KEY = "i18nextLng";

function applyDir(lng){
  const dir = RTL.has(lng) ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", lng);
  // Chakra: petit hack pour refléter la direction sans remonter tout
  document.documentElement.style.setProperty("--chakra-ui-dir", dir);
}

export default function LanguageRouteSync() {
  const { pathname, search } = useLocation();
  const { i18n } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    const [, seg1] = pathname.split("/"); // "" | "en" | "dashboard" ...
    const seg = (seg1 || "").toLowerCase();
    const queryLng = new URLSearchParams(search).get("lng")?.split("-")[0]?.toLowerCase();

    const syncLanguage = async (lng) => {
      await ensureLanguageLoaded(lng);
      if (cancelled) return;
      if ((i18n.language || "").split("-")[0] !== lng) await i18n.changeLanguage(lng);
      applyDir(lng);
    };

    if (SUPPORTED.includes(queryLng)) {
      syncLanguage(queryLng);
    } else if (SUPPORTED.includes(seg)) {
      // URL contient une langue
      syncLanguage(seg);
    } else {
      const storedLng = localStorage.getItem(STORAGE_KEY)?.split("-")[0]?.toLowerCase();
      if (SUPPORTED.includes(storedLng)) {
        syncLanguage(storedLng);
      } else {
        // Pas de langue dans l'URL → on n'impose rien (détection normale)
        applyDir((i18n.resolvedLanguage || i18n.language || "fr").split("-")[0]);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [pathname, search, i18n]);

  useEffect(() => {
    const onChange = (lng) => applyDir(lng.split("-")[0]);
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, [i18n]);

  return null;
}
