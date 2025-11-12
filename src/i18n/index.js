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
  ar: { common: ar }
};

/* ---------- Helper direction LTR/RTL ---------- */
const setDocumentDirection = (lng) => {
  const rtlLangs = ["ar"];
  const dir = rtlLangs.includes(lng) ? "rtl" : "ltr";
  const html = document.documentElement;
  if (html.getAttribute("dir") !== dir) {
    html.setAttribute("dir", dir);
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Si une clé manque dans la langue courante → essaie FR puis EN
    fallbackLng: ["fr", "en"],

    supportedLngs: ["fr", "en", "it", "es", "de", "ru", "ar"],
    nonExplicitSupportedLngs: true,
    cleanCode: true,

    ns: ["common"],
    defaultNS: "common",

    detection: {
      // 1) /en 2) ?lng=en 3) localStorage 4) navigateur 5) <html lang="">
      order: ["path", "querystring", "localStorage", "navigator", "htmlTag"],
      lookupFromPathIndex: 0,
      lookupQuerystring: "lng",
      caches: ["localStorage"]
    },

    interpolation: { escapeValue: false },

    returnEmptyString: false,
    returnNull: false,

    react: {
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ["b", "strong", "i", "br"],
      useSuspense: false
    }

    // debug: true,
  });

// Applique la bonne direction au chargement…
setDocumentDirection(i18n.resolvedLanguage || i18n.language || "fr");
// …et à chaque changement de langue
i18n.on("languageChanged", (lng) => setDocumentDirection(lng));

export default i18n;

