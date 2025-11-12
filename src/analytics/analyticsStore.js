// src/analytics/analyticsStore.js
import { db } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp, increment } from "firebase/firestore";

/**
 * Incrémente un compteur par ville/pays :
 * analytics_geo/{COUNTRY-city}
 */
export async function saveAnalyticsGeo({ city, country }) {
  const safeCountry = (country || "UN").toUpperCase();
  const safeCity = (city || "unknown").toLowerCase().replace(/\s+/g, "-");
  const id = `${safeCountry}-${safeCity}`;
  const ref = doc(db, "analytics_geo", id);

  await setDoc(
    ref,
    {
      country: safeCountry,
      city: city || "unknown",
      pv: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

