// src/analytics/analyticsStore.js
import { db } from "../firebaseConfig";
import {
  doc,
  runTransaction,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { getVisitorId } from "../utils/analytics";

function cleanVisitorPart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120);
}

function fmtDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function slug(value) {
  return String(value || "unknown")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

/**
 * Incrémente un compteur par ville/pays :
 * analytics_geo/{COUNTRY-city}
 * analytics_geo_daily/{DAY__COUNTRY-city}
 * analytics_geo_hourly/{DAY__HH__COUNTRY-city}
 */
export async function saveAnalyticsGeo({ city, country, uid = null }) {
  const safeCountry = (country || "UN").toUpperCase();
  const safeCity = city || "unknown";
  const id = `${safeCountry}-${slug(safeCity)}`;
  const now = new Date();
  const day = fmtDay(now);
  const hour = now.getHours();
  const hourKey = String(hour).padStart(2, "0");
  const cleanUid = cleanVisitorPart(uid);
  const visitorId = cleanUid ? `uid:${cleanUid}` : getVisitorId();

  const geoRef = doc(db, "analytics_geo", id);
  const geoAllVisitorRef = doc(db, "analytics_geo", id, "visitors_all", visitorId);
  const geoDailyRef = doc(db, "analytics_geo_daily", `${day}__${id}`);
  const geoDailyVisitorRef = doc(db, "analytics_geo_daily", `${day}__${id}`, "visitors", visitorId);
  const geoHourlyRef = doc(db, "analytics_geo_hourly", `${day}__${hourKey}__${id}`);
  const geoHourlyVisitorRef = doc(db, "analytics_geo_hourly", `${day}__${hourKey}__${id}`, "visitors", visitorId);

  await runTransaction(db, async (tx) => {
    const [
      geoAllVisitorSnap,
      geoDailyVisitorSnap,
      geoHourlyVisitorSnap,
    ] = await Promise.all([
      tx.get(geoAllVisitorRef),
      tx.get(geoDailyVisitorRef),
      tx.get(geoHourlyVisitorRef),
    ]);

    tx.set(geoRef, {
      country: safeCountry,
      city: safeCity,
      pv: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (!geoAllVisitorSnap.exists()) {
      tx.set(geoAllVisitorRef, {
        visitorId,
        firstSeenAt: serverTimestamp(),
        country: safeCountry,
        city: safeCity,
      });
      tx.set(geoRef, { users: increment(1) }, { merge: true });
    }

    tx.set(geoDailyRef, {
      day,
      geoId: id,
      country: safeCountry,
      city: safeCity,
      pv: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (!geoDailyVisitorSnap.exists()) {
      tx.set(geoDailyVisitorRef, {
        visitorId,
        firstSeenAt: serverTimestamp(),
        country: safeCountry,
        city: safeCity,
      });
      tx.set(geoDailyRef, { uniqueVisitors: increment(1) }, { merge: true });
    }

    tx.set(geoHourlyRef, {
      day,
      hour,
      geoId: id,
      country: safeCountry,
      city: safeCity,
      pv: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (!geoHourlyVisitorSnap.exists()) {
      tx.set(geoHourlyVisitorRef, {
        visitorId,
        firstSeenAt: serverTimestamp(),
        country: safeCountry,
        city: safeCity,
      });
      tx.set(geoHourlyRef, { uniqueVisitors: increment(1) }, { merge: true });
    }
  });
}
