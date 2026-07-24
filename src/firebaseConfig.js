// src/firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

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

// --- Firestore ---
const firestoreSettings = {
  // Le long-polling forcé dégrade les performances. L'auto-détection conserve
  // le fallback pour les réseaux/proxies qui en ont réellement besoin.
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: true,
  ignoreUndefinedProperties: true,
};

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    ...firestoreSettings,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (error) {
  console.warn("[Firebase] Persistent Firestore cache unavailable, using default cache.", error);
  try {
    firestoreDb = initializeFirestore(app, firestoreSettings);
  } catch {
    firestoreDb = getFirestore(app);
  }
}

export const db = firestoreDb;

// --- Auth ---
export const auth = getAuth(app);

export default app;
