// src/firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// ✅ Configuration corrigée
const firebaseConfig = {
  apiKey: "AIzaSyDpM1cjpDpbXy8Alo_zCBYViQB0E09cTNA",
  authDomain: "boost-your-life-f6b3e.firebaseapp.com",
  projectId: "boost-your-life-f6b3e",
  // ⚠️ Corrigé → domaine doit être *.appspot.com
  storageBucket: "boost-your-life-f6b3e.firebasestorage.app",
  messagingSenderId: "126973113883",
  appId: "1:126973113883:web:24c19655af64bdfcec0f3e",
  measurementId: "G-2X9GZWE2B0",
};

// Initialise (ou réutilise en dev)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// --- Firestore ---
// Options réseau pour éviter "client is offline" derrière proxy/AdBlock.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

// --- Auth & Storage ---
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;

