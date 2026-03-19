// src/utils/analytics.js
import { db } from "../firebaseConfig";
import {
  doc,
  collection,
  serverTimestamp,
  runTransaction,
  increment,
} from "firebase/firestore";

/** YYYY-MM-DD */
function fmtDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 0-23 (heure locale du navigateur) */
function fmtHour(d = new Date()) {
  return d.getHours();
}

/** Stable visitor id: uid si connecté, sinon anon localStorage */
export function getVisitorId(user) {
  if (user?.uid) return `uid:${user.uid}`;
  try {
    const key = "BYL_ANON_ID";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
      localStorage.setItem(key, id);
    }
    return `anon:${id}`;
  } catch {
    return `anon:${Math.random().toString(36).slice(2)}`;
  }
}

/** Sanitize clés Firestore (field path) */
function safeKey(k) {
  return String(k || "")
    .replaceAll(".", "·")
    .replaceAll("/", "∕")
    .replaceAll("#", "＃")
    .replaceAll("$", "＄")
    .replaceAll("[", "⟦")
    .replaceAll("]", "⟧");
}

/** Slug simple ville */
function slugCity(city) {
  return String(city || "unknown")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Log d’une page vue (avec écritures):
 *  1) analytics_daily/{YYYY-MM-DD} (pageviews, byPage, byCountry, byRole, uniqueVisitors)
 *  2) analytics_geo/{COUNTRY}-{citySlug} (pv + users all-time)
 *  3) analytics_geo_daily/{YYYY-MM-DD__COUNTRY-citySlug} (pv + uniqueVisitors par ville et par jour)
 *  4) analytics_geo_hourly/{YYYY-MM-DD__HH__COUNTRY-citySlug} (pv + uniqueVisitors par ville, jour et heure)
 */
export async function trackPageView({
  user,
  path,
  country,      // ex: "FR"
  city,         // ex: "Antibes"
  roleEffectif, // "admin" | "coach" | "particulier" | null
}) {
  try {
    const day = fmtDay();
    const hour = fmtHour(); // 0-23 (local)
    const visitorId = getVisitorId(user);

    /* ------------------------------------------------------------------ */
    /* 1) Aggregation par jour (global)                                    */
    /* ------------------------------------------------------------------ */
    const dailyRef = doc(db, "analytics_daily", day);
    const visitorRef = doc(collection(dailyRef, "visitors"), visitorId);

    await runTransaction(db, async (tx) => {
      // ✅ IMPORTANT: toutes les lectures avant écritures
      const [dailySnap, vSnap] = await Promise.all([
        tx.get(dailyRef),
        tx.get(visitorRef),
      ]);

      if (!dailySnap.exists()) {
        tx.set(dailyRef, {
          day,
          pageviews: 0,
          uniqueVisitors: 0,
          byPage: {},
          byCountry: {},
          byRole: {},
          events: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // pageviews + byPage
      tx.update(dailyRef, {
        pageviews: increment(1),
        [`byPage.${safeKey(path || "/")}`]: increment(1),
        updatedAt: serverTimestamp(),
      });

      // pays
      if (country) {
        tx.update(dailyRef, {
          [`byCountry.${safeKey(country)}`]: increment(1),
        });
      }

      // rôle
      if (roleEffectif) {
        tx.update(dailyRef, {
          [`byRole.${safeKey(roleEffectif)}`]: increment(1),
        });
      }

      // unique visitor du jour (global)
      if (!vSnap.exists()) {
        tx.set(visitorRef, {
          visitorId,
          uid: user?.uid || null,
          firstSeenAt: serverTimestamp(),
          pathFirst: path || "/",
          country: country || null,
          city: city || null,
          role: roleEffectif || null,
        });
        tx.update(dailyRef, { uniqueVisitors: increment(1) });
      }
    });

    /* ------------------------------------------------------------------ */
    /* 2) Aggregation geo globale (all-time)                               */
    /* ------------------------------------------------------------------ */
    const cc = (country || "UN").toUpperCase();
    const cityKey = slugCity(city || "unknown");
    const geoId = `${cc}-${cityKey}`;
    const geoRef = doc(db, "analytics_geo", geoId);

    // 🔥 unique all-time par ville : visitors_all/{visitorId}
    const geoAllVisitorRef = doc(collection(geoRef, "visitors_all"), visitorId);

    await runTransaction(db, async (tx) => {
      const [gSnap, allVSnap] = await Promise.all([
        tx.get(geoRef),
        tx.get(geoAllVisitorRef),
      ]);

      if (!gSnap.exists()) {
        tx.set(geoRef, {
          country: cc,
          city: city || "unknown",
          pv: 0,
          users: 0, // ✅ uniques all-time (par ville)
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }

      // PV all-time
      tx.update(geoRef, {
        pv: increment(1),
        updatedAt: serverTimestamp(),
      });

      // unique all-time (par ville)
      if (!allVSnap.exists()) {
        tx.set(geoAllVisitorRef, {
          visitorId,
          uid: user?.uid || null,
          firstSeenAt: serverTimestamp(),
          country: cc,
          city: city || "unknown",
        });
        tx.update(geoRef, { users: increment(1) });
      }
    });

    /* ------------------------------------------------------------------ */
    /* 3) Aggregation geo PAR JOUR (pour jour/7j/30j sur la carte)          */
    /* ------------------------------------------------------------------ */
    // doc id stable: "YYYY-MM-DD__FR-nice"
    const geoDailyId = `${day}__${geoId}`;
    const geoDailyRef = doc(db, "analytics_geo_daily", geoDailyId);
    const geoDailyVisitorRef = doc(collection(geoDailyRef, "visitors"), visitorId);

    await runTransaction(db, async (tx) => {
      const [dSnap, dvSnap] = await Promise.all([
        tx.get(geoDailyRef),
        tx.get(geoDailyVisitorRef),
      ]);

      if (!dSnap.exists()) {
        tx.set(geoDailyRef, {
          day,
          geoId,
          country: cc,
          city: city || "unknown",
          pv: 0,
          uniqueVisitors: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // PV du jour pour cette ville
      tx.update(geoDailyRef, {
        pv: increment(1),
        updatedAt: serverTimestamp(),
      });

      // unique du jour pour cette ville
      if (!dvSnap.exists()) {
        tx.set(geoDailyVisitorRef, {
          visitorId,
          uid: user?.uid || null,
          firstSeenAt: serverTimestamp(),
          pathFirst: path || "/",
          country: cc,
          city: city || "unknown",
          role: roleEffectif || null,
        });
        tx.update(geoDailyRef, { uniqueVisitors: increment(1) });
      }
    });

    /* ------------------------------------------------------------------ */
    /* 4) Aggregation geo PAR HEURE (jour + heure + ville)                  */
    /* ------------------------------------------------------------------ */
    // doc id stable: "YYYY-MM-DD__HH__FR-nice"
    const hh = String(hour).padStart(2, "0");
    const geoHourlyId = `${day}__${hh}__${geoId}`;
    const geoHourlyRef = doc(db, "analytics_geo_hourly", geoHourlyId);
    const geoHourlyVisitorRef = doc(collection(geoHourlyRef, "visitors"), visitorId);

    await runTransaction(db, async (tx) => {
      const [hSnap, hvSnap] = await Promise.all([
        tx.get(geoHourlyRef),
        tx.get(geoHourlyVisitorRef),
      ]);

      if (!hSnap.exists()) {
        tx.set(geoHourlyRef, {
          day,
          hour, // 0-23 (number)
          geoId,
          country: cc,
          city: city || "unknown",
          pv: 0,
          uniqueVisitors: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // PV de l'heure pour cette ville
      tx.update(geoHourlyRef, {
        pv: increment(1),
        updatedAt: serverTimestamp(),
      });

      // unique de l'heure pour cette ville
      if (!hvSnap.exists()) {
        tx.set(geoHourlyVisitorRef, {
          visitorId,
          uid: user?.uid || null,
          firstSeenAt: serverTimestamp(),
          pathFirst: path || "/",
          country: cc,
          city: city || "unknown",
          role: roleEffectif || null,
        });
        tx.update(geoHourlyRef, { uniqueVisitors: increment(1) });
      }
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn("trackPageView error:", e);
  }
}

/** Événements personnalisés (facultatif) */
export async function trackEvent({
  user,
  name,
  path,
  country,
  roleEffectif,
  value = 1,
}) {
  if (!name) return;

  try {
    const day = fmtDay();
    const dailyRef = doc(db, "analytics_daily", day);

    await runTransaction(db, async (tx) => {
      const dailySnap = await tx.get(dailyRef);

      if (!dailySnap.exists()) {
        tx.set(dailyRef, {
          day,
          pageviews: 0,
          uniqueVisitors: 0,
          byPage: {},
          byCountry: {},
          byRole: {},
          events: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const n = safeKey(name);
      const r = safeKey(roleEffectif || "unknown");
      const p = safeKey(path || "/");
      const c = safeKey(country || "UN");

      tx.update(dailyRef, {
        [`events.${n}.count`]: increment(value),
        [`events.${n}.byRole.${r}`]: increment(value),
        [`events.${n}.byPage.${p}`]: increment(value),
        [`events.${n}.byCountry.${c}`]: increment(value),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn("trackEvent error:", e);
  }
}

