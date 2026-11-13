// src/firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache,
  terminate,
} from "firebase/firestore";
import { getAuth, beforeAuthStateChanged, onAuthStateChanged } from "firebase/auth";
import { lockPrivateSession } from "./utils/privateSession.js";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

// ✅ Configuration correcte
const firebaseConfig = {
  apiKey: "AIzaSyDpM1cjpDpbXy8Alo_zCBYViQB0E09cTNA",
  authDomain: "boost-your-life-f6b3e.firebaseapp.com",
  projectId: "boost-your-life-f6b3e",
  // ✅ DOIT utiliser le domaine *.appspot.com
  storageBucket: "boost-your-life-f6b3e.firebasestorage.app",
  messagingSenderId: "126973113883",
  appId: "1:126973113883:web:24c19655af64bdfcec0f3e",
  measurementId: "G-2X9GZWE2B0",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// App Check becomes active as soon as the reCAPTCHA Enterprise site key is
// configured in the deployed frontend. Enforcement must only be enabled in
// Firebase after the valid-request metrics have been observed.
const appCheckSiteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || "").trim();
if (typeof window !== "undefined" && appCheckSiteKey) {
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("[Firebase] App Check initialization skipped.", error?.message || error);
  }
}

// --- Firestore ---
const firestoreSettings = {
  // Le long-polling forcé dégrade les performances. L'auto-détection conserve
  // le fallback pour les réseaux/proxies qui en ont réellement besoin.
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: true,
  ignoreUndefinedProperties: true,
};

// Fail closed if another initializer already owns an incompatible SDK cache.
const firestoreDb = initializeFirestore(app, {
  ...firestoreSettings,
  localCache: memoryLocalCache(),
});

export const db = firestoreDb;

// --- Auth ---
export const auth = getAuth(app);

// End the old SDK before a different principal can access its memory cache.
// A fresh realm also retires component globals and pending callbacks. We never
// clear IndexedDB here: inherited mutations/drafts require explicit migration.
let previousPrincipal = auth.currentUser?.uid || null;
beforeAuthStateChanged(auth, async next => {
  if (previousPrincipal && previousPrincipal !== next?.uid) {
    lockPrivateSession();
    await terminate(db);
  }
});
onAuthStateChanged(auth, next => {
  if (previousPrincipal && previousPrincipal !== next?.uid && typeof window !== 'undefined') {
    lockPrivateSession();
    window.location.replace(next ? window.location.href : '/login');
    return;
  }
  previousPrincipal = next?.uid || null;
});
export default app;
