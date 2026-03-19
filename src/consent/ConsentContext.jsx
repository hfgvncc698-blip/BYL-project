// src/consent/ConsentContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { saveConsentToFirestore } from "./consentStore";
import { useAuth } from "../AuthContext";

const ConsentContext = createContext(null);

const STORAGE_KEY = "byl_consent_v1";
const LEGACY_KEY = "BYL_COOKIE_PREFS"; // compat / debug
const POLICY_VERSION = "v1"; // incrémente quand tu modifies la politique

const DEFAULT_PREFS = {
  functional: true, // nécessaires
  analytics: false, // mesure d’audience (et géoloc stockée)
  marketing: false, // tags marketing
};

export function ConsentProvider({ children }) {
  const { user } = useAuth(); // doit exposer user?.uid

  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [asked, setAsked] = useState(false);
  const [loaded, setLoaded] = useState(false); // ✅ important

  useEffect(() => {
    try {
      // 1) clé principale
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const next = {
          functional: true,
          analytics: !!p.analytics,
          marketing: !!p.marketing,
        };
        setPrefs(next);
        setAsked(true);
        setLoaded(true);
        return;
      }

      // 2) compat ancienne clé (si jamais)
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const p = JSON.parse(legacy);
        const next = {
          functional: true,
          analytics: !!p.analytics,
          marketing: !!p.marketing,
        };
        setPrefs(next);
        setAsked(true);

        // on migre vers la clé principale
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setLoaded(true);
        return;
      }

      setAsked(false);
      setPrefs(DEFAULT_PREFS);
      setLoaded(true);
    } catch {
      setAsked(false);
      setPrefs(DEFAULT_PREFS);
      setLoaded(true);
    }
  }, []);

  const save = async (next) => {
    const merged = { ...prefs, ...next, functional: true };

    setPrefs(merged);
    setAsked(true);

    // ✅ écrit dans la clé principale
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    // ✅ écrit aussi dans la clé legacy pour compat/debug
    localStorage.setItem(LEGACY_KEY, JSON.stringify(merged));

    // 🔒 Journalise côté serveur si l'utilisateur est connecté
    try {
      if (user?.uid) {
        await saveConsentToFirestore(user.uid, merged, POLICY_VERSION);
      }
    } catch (e) {
      // pas bloquant
      if (import.meta.env.DEV) console.warn("saveConsentToFirestore error:", e);
    }
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    setPrefs(DEFAULT_PREFS);
    setAsked(false);
  };

  const value = useMemo(
    () => ({
      prefs,
      save,
      asked,
      loaded, // ✅ exposé
      reset,
    }),
    [prefs, asked, loaded]
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
}

