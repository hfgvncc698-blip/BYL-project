import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { saveConsentToFirestore } from "./consentStore";
import { useAuth } from "../AuthContext";

const ConsentContext = createContext(null);
const STORAGE_KEY = "byl_consent_v1";
const POLICY_VERSION = "v1"; // incrémente quand tu modifies la politique

export function ConsentProvider({ children }) {
  const { user } = useAuth(); // doit exposer user?.uid
  const [prefs, setPrefs] = useState({
    functional: true,   // nécessaires
    analytics: false,   // mesure d’audience (et géoloc stockée)
    marketing: false,   // tags marketing
  });
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        setPrefs({
          functional: true,
          analytics: !!p.analytics,
          marketing: !!p.marketing,
        });
        setAsked(true);
      } else {
        setAsked(false);
      }
    } catch {
      setAsked(false);
    }
  }, []);

  const save = async (next) => {
    const merged = { ...prefs, ...next, functional: true };
    setPrefs(merged);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    setAsked(true);

    // 🔒 Journalise côté serveur si l'utilisateur est connecté
    if (user?.uid) {
      await saveConsentToFirestore(user.uid, merged, POLICY_VERSION);
    }
  };

  const value = useMemo(
    () => ({
      prefs,
      save,
      asked,
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        setAsked(false);
      },
    }),
    [prefs, asked]
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
}

