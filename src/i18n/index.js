// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

/* ---------- Ressources JSON (toutes les langues) ---------- */
import fr from "./locales/fr/common.json";
import en from "./locales/en/common.json";
import it from "./locales/it/common.json";
import es from "./locales/es/common.json";
import de from "./locales/de/common.json";
import ru from "./locales/ru/common.json";
import ar from "./locales/ar/common.json";

/* ---------- Dictionnaires ---------- */
const resources = {
  fr: { common: fr },
  en: { common: en },
  it: { common: it },
  es: { common: es },
  de: { common: de },
  ru: { common: ru },
  ar: { common: ar },
};

/* ---------- Helpers (LTR/RTL + <html lang>) ---------- */
const normalizeLng = (lng) => String(lng || "fr").split("-")[0]; // ex: fr-FR -> fr, ar-SA -> ar

const applyDocumentLangAndDir = (lng) => {
  if (typeof document === "undefined") return;

  const base = normalizeLng(lng);
  const dir = base === "ar" ? "rtl" : "ltr";
  const html = document.documentElement;

  if (html.getAttribute("dir") !== dir) html.setAttribute("dir", dir);
  if (html.getAttribute("lang") !== base) html.setAttribute("lang", base);
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,

    // Si une clé manque -> retombe sur FR puis EN
    fallbackLng: ["fr", "en"],

    supportedLngs: ["fr", "en", "it", "es", "de", "ru", "ar"],
    nonExplicitSupportedLngs: true,
    cleanCode: true,

    ns: ["common"],
    defaultNS: "common",

    detection: {
      /**
       * Ordre de détection :
       * 1) /en/... (si tu utilises des routes avec prefix langue)
       * 2) ?lng=en
       * 3) localStorage
       * 4) navigateur
       * 5) <html lang="">
       */
      order: ["path", "querystring", "localStorage", "navigator", "htmlTag"],

      lookupFromPathIndex: 0,
      lookupQuerystring: "lng",

      // Important : évite qu'un segment d'URL comme "login" ou "coach-dashboard"
      // soit pris pour une langue
      checkWhitelist: true,

      caches: ["localStorage"],
    },

    interpolation: { escapeValue: false },

    returnEmptyString: false,
    returnNull: false,

    react: {
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ["b", "strong", "i", "br"],
      useSuspense: false,
    },

    // debug: true,
  });

// Applique direction + lang au chargement
applyDocumentLangAndDir(i18n.resolvedLanguage || i18n.language || "fr");

// Et à chaque changement de langue
i18n.on("languageChanged", (lng) => {
  applyDocumentLangAndDir(lng);
});

export default i18n;

