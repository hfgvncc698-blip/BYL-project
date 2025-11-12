import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const SUPPORTED = ["fr","en","it","es","de","ru","ar"];
const RTL = new Set(["ar"]);

function applyDir(lng){
  const dir = RTL.has(lng) ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", lng);
  // Chakra: petit hack pour refléter la direction sans remonter tout
  document.documentElement.style.setProperty("--chakra-ui-dir", dir);
}

export default function LanguageRouteSync() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  useEffect(() => {
    const [, seg1, ...rest] = pathname.split("/"); // "" | "en" | "dashboard" ...
    const seg = (seg1 || "").toLowerCase();

    if (SUPPORTED.includes(seg)) {
      // URL contient une langue
      if (i18n.language !== seg) i18n.changeLanguage(seg);
      applyDir(seg);
    } else {
      // Pas de langue dans l'URL → on n'impose rien (détection normale)
      applyDir((i18n.resolvedLanguage || "fr").split("-")[0]);
    }
  }, [pathname, i18n]);

  useEffect(() => {
    const onChange = (lng) => applyDir(lng.split("-")[0]);
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, [i18n]);

  return null;
}

