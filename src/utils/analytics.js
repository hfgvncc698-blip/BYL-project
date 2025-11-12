// src/utils/analytics.js
import { db } from "../firebaseConfig";
import {
  doc,
  collection,
  serverTimestamp,
  runTransaction,
  setDoc,
  getDoc,
  increment,
} from "firebase/firestore";

/** YYYY-MM-DD */
function fmtDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/** Sanitize clés Firestore */
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
 * Log d’une page vue (avec 2 écritures):
 *  - analytics_daily/{YYYY-MM-DD} (pageviews, byPage, byCountry, byRole, uniqueVisitors)
 *  - analytics_geo/{COUNTRY}-{citySlug} (pv)
 */
export async function trackPageView({
  user,
  path,
  country,      // ex: "FR"
  city,         // ex: "Antibes" (optionnel mais recommandé)
  roleEffectif, // "admin" | "coach" | "particulier" | null
}) {
  try {
    const day = fmtDay();
    const visitorId = getVisitorId(user);

    // ===== 1) Aggregation par jour =====
    const dailyRef = doc(db, "analytics_daily", day);
    const visitorRef = doc(collection(dailyRef, "visitors"), visitorId);

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

      // unique visitor du jour
      const vSnap = await tx.get(visitorRef);
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

    // ===== 2) Aggregation par ville/country (globale) =====
    // si pas de pays, on regroupe dans "UN-unknown"
    const cc = (country || "UN").toUpperCase();
    const cityKey = slugCity(city || "unknown");
    const geoId = `${cc}-${cityKey}`;
    const geoRef = doc(db, "analytics_geo", geoId);
    await runTransaction(db, async (tx) => {
      const g = await tx.get(geoRef);
      if (!g.exists()) {
        tx.set(geoRef, {
          country: cc,
          city: city || "unknown",
          pv: 0,
          updatedAt: serverTimestamp(),
        });
      }
      tx.update(geoRef, {
        pv: increment(1),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn("trackPageView error:", e);
  }
}

/** Événements personnalisés (facultatif, conservé) */
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
      tx.update(dailyRef, {
        [`events.${safeKey(name)}.count`]: increment(value),
        [`events.${safeKey(name)}.byRole.${safeKey(roleEffectif || "unknown")}`]: increment(value),
        [`events.${safeKey(name)}.byPage.${safeKey(path || "/")}`]: increment(value),
        [`events.${safeKey(name)}.byCountry.${safeKey(country || "UN")}`]: increment(value),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn("trackEvent error:", e);
  }
}

