// src/i18n/index.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import nutritionRecentTranslations from "./nutritionRecentTranslations";

/* ---------- Ressources JSON (toutes les langues) ---------- */
import fr from "./locales/fr/common.json";

/* ---------- Dictionnaires ---------- */
const resources = {
  fr: { common: fr },
};

const supportedLngs = ["fr", "en", "it", "es", "de", "ru", "ar"];
const loadedLanguages = new Set(["fr"]);
const localeLoaders = {
  en: () => import("./locales/en/common.json"),
  it: () => import("./locales/it/common.json"),
  es: () => import("./locales/es/common.json"),
  de: () => import("./locales/de/common.json"),
  ru: () => import("./locales/ru/common.json"),
  ar: () => import("./locales/ar/common.json"),
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

export const ensureLanguageLoaded = async (lng) => {
  const base = normalizeLng(lng);
  if (!supportedLngs.includes(base) || loadedLanguages.has(base)) return { base, loadedNow: false };
  const loader = localeLoaders[base];
  if (!loader) return { base: "fr", loadedNow: false };

  const mod = await loader();
  i18n.addResourceBundle(base, "common", mod.default || mod, true, true);
  i18n.addResourceBundle(base, "common", nutritionRecentTranslations[base] || {}, true, true);
  loadedLanguages.add(base);
  return { base, loadedNow: true };
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,

    // Si une clé manque -> retombe sur FR puis EN
    fallbackLng: ["fr", "en"],

    supportedLngs,
    nonExplicitSupportedLngs: true,
    cleanCode: true,

    ns: ["common"],
    defaultNS: "common",

    detection: {
      /**
       * Ordre de détection :
       * 1) ?lng=en
       * 2) localStorage
       * 3) /en/... (si tu utilises des routes avec prefix langue)
       * 4) navigateur
       * 5) <html lang="">
       */
      order: ["querystring", "localStorage", "path", "navigator", "htmlTag"],

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

i18n.addResourceBundle("fr", "common", nutritionRecentTranslations.fr, true, true);

// Applique direction + lang au chargement
applyDocumentLangAndDir(i18n.resolvedLanguage || i18n.language || "fr");
ensureLanguageLoaded(i18n.resolvedLanguage || i18n.language || "fr").then(({ base, loadedNow }) => {
  if (loadedNow && base !== "fr" && normalizeLng(i18n.language) === base) {
    i18n.changeLanguage(base);
  }
});

// Et à chaque changement de langue
i18n.on("languageChanged", (lng) => {
  const base = normalizeLng(lng);
  applyDocumentLangAndDir(base);
  ensureLanguageLoaded(base).then(({ base: loadedBase, loadedNow }) => {
    if (loadedNow && loadedBase !== "fr" && normalizeLng(i18n.language) === loadedBase) {
      i18n.changeLanguage(loadedBase);
    }
  });
});

export default i18n;
