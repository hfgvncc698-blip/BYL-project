// src/consent/consentStore.js
import { db } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Enregistre le consentement utilisateur dans Firestore
 * users/{uid}/privacy/consent
 */
export async function saveConsentToFirestore(uid, prefs, policyVersion = "v1") {
  if (!uid) return;
  const ref = doc(db, "users", uid, "privacy", "consent");
  const payload = {
    analytics: !!prefs.analytics,
    marketing: !!prefs.marketing,
    policyVersion,
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    // on log sans bloquer l'UX
    console.error("Failed to save consent to Firestore:", e);
  }
}

